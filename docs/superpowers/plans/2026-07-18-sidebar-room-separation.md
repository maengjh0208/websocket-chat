# 사이드바 그룹방 / DM방 분리 계획

## 목표

현재 사이드바 "채팅방" 섹션에 그룹방과 DM방이 혼재되어 있음.  
이를 두 섹션으로 분리하고, DM방은 상대방 username으로 표시.

## 완성 레이아웃

```
┌───────────────────┐
│  내 이름  [로그아웃] │
├───────────────────┤
│ 그룹방          [+] │
│  # 개발팀         │
│  # 스터디         │
├───────────────────┤
│ DM              [+] │ ← 버튼 클릭 시 DM 상대 선택 UI
│  alice            │  ← room.name이 아니라 상대방 username
│  bob              │
├───────────────────┤
│ 친구              │
│ ...               │
└───────────────────┘
```

---

## 접근 방법: `GET /rooms` 응답에 `dm_partner` 필드 추가

DM방마다 별도 API(`GET /rooms/{id}/members`)를 호출하면 N번 요청 발생.  
대신 방 목록 조회 시 한 번에 상대방 정보를 포함해서 내려주는 방식.

```json
{
  "id": "...",
  "name": "DM_...",
  "is_dm": true,
  "created_by": "...",
  "created_at": "...",
  "dm_partner": { "id": "...", "username": "alice" }  ← 추가
}
```

그룹방은 `dm_partner: null`.

---

## Step 1 — 백엔드 스키마 수정 (직접 작성)

**파일:** `backend/app/schemas/room.py`

`RoomResponse`에 `dm_partner` 필드 추가:

```python
class DmPartnerInfo(BaseModel):
    id: UUID
    username: str

class RoomResponse(BaseModel):
    id: UUID
    name: str
    is_dm: bool
    created_by: UUID
    created_at: datetime
    dm_partner: DmPartnerInfo | None = None  # DM방일 때만 채워짐
```

---

## Step 2 — 백엔드 CRUD 수정 (직접 작성)

**파일:** `backend/app/crud/room.py`

기존 `get_rooms(user_id)` 함수를 수정하거나 새 함수 추가.  
DM방일 경우 `RoomMember JOIN User`로 상대방(나 아닌 멤버) 정보를 함께 조회.

힌트 — 반환 타입을 `list[tuple[RoomEntity, UserEntity | None]]` 형태로 바꾸거나,  
`RoomEntity`에 `dm_partner` 속성을 붙여서 반환하는 방식 모두 가능.

가장 단순한 방법: 기존 `get_rooms` 는 그대로 두고, DM 상대방만 별도로 조회하는 helper 추가:

```python
async def get_dm_partner(session: AsyncSession, room_id: UUID, my_user_id: UUID) -> UserEntity | None:
    # RoomMember JOIN User WHERE room_id = room_id AND user_id != my_user_id AND left_at IS NULL
    # return UserEntity | None
```

---

## Step 3 — 백엔드 서비스 수정 (직접 작성)

**파일:** `backend/app/services/room.py`

`get_rooms` 서비스에서 각 방에 대해 DM 여부 확인 후 `dm_partner` 조회:

```python
async def get_rooms(user_id: UUID, session: AsyncSession) -> list[RoomEntity]:
    rooms = await crud_room.get_rooms(session=session, user_id=user_id)
    for room in rooms:
        if room.is_dm:
            room.dm_partner = await crud_room.get_dm_partner(
                session=session, room_id=room.id, my_user_id=user_id
            )
    return rooms
```

참고: `RoomEntity`에 `dm_partner` 속성이 없다면 도메인 엔티티에도 추가 필요.

**파일:** `backend/app/domain/room.py`

```python
@dataclass
class RoomEntity:
    ...
    dm_partner: UserEntity | None = None  # DM방일 때만
```

---

## Step 4 — 백엔드 라우터 수정 (직접 작성)

**파일:** `backend/app/api/routes/rooms.py`

`GET /rooms` 응답 직렬화에 `dm_partner` 매핑 추가:

```python
RoomResponse(
    ...,
    dm_partner=DmPartnerInfo(
        id=room.dm_partner.id,
        username=room.dm_partner.username,
    ) if room.dm_partner else None,
)
```

`DmPartnerInfo`를 임포트하는 것 잊지 말 것.

---

## Step 5 — 프론트엔드 타입 및 스토어 (Claude가 작성)

**파일:** `frontend/src/types/index.ts`

`Room` 타입에 `dm_partner` 필드 추가.

---

## Step 6 — 프론트엔드 Sidebar 수정 (Claude가 작성)

**파일:** `frontend/src/components/Chat/Sidebar.tsx`

- `rooms`를 `groupRooms` / `dmRooms`로 분리 필터링
- "그룹방" 섹션: `groupRooms` 렌더링 (기존과 동일)
- "DM" 섹션: `dmRooms` 렌더링, 이름은 `room.dm_partner?.username ?? room.name`
- DM 섹션의 [+] 버튼 → 기존 `CreateRoomModal`의 DM 탭으로 연결

---

## 진행 순서

| 순서 | 담당 | 작업 |
|------|------|------|
| 1 | 직접 작성 | `schemas/room.py` — `DmPartnerInfo`, `RoomResponse.dm_partner` |
| 2 | 직접 작성 | `domain/room.py` — `RoomEntity.dm_partner` |
| 3 | 직접 작성 | `crud/room.py` — `get_dm_partner` helper |
| 4 | 직접 작성 | `services/room.py` — `get_rooms`에서 `dm_partner` 채우기 |
| 5 | 직접 작성 | `routes/rooms.py` — `RoomResponse` 직렬화에 `dm_partner` 추가 |
| 6–7 | Claude | 프론트엔드 타입 + `Sidebar.tsx` 수정 |

백엔드 5단계 완료 후 알려주면 프론트엔드를 작성합니다.

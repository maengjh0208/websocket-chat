# 사이드바 그룹방 / DM방 분리 계획 ✅ 완료

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
│ DM              [+] │
│  alice            │  ← room.name이 아니라 상대방 username
│  bob              │
├───────────────────┤
│ 친구              │
│ ...               │
└───────────────────┘
```

---

## API 설계

```
GET /rooms     → 그룹방 목록만 반환  (RoomResponse, dm_partner 없음)
GET /rooms/dm  → DM방 목록만 반환   (DmRoomResponse, dm_partner 항상 포함)
```

그룹방과 DM방은 성격이 다른 리소스이므로 엔드포인트를 분리.  
프론트에서 두 요청을 병렬로 호출하면 성능 차이 없음.

---

## Step 1 — 백엔드 스키마 수정 ✅ 완료

**파일:** `backend/app/schemas/room.py`

`DmPartnerInfo`와 `DmRoomResponse` 추가. `RoomResponse`는 그룹방 전용으로 유지.

```python
class DmPartnerInfo(BaseModel):
    id: UUID
    username: str

class RoomResponse(BaseModel):       # 그룹방 전용
    id: UUID
    name: str
    is_dm: bool
    created_by: UUID
    created_at: datetime

class DmRoomResponse(BaseModel):     # DM방 전용
    id: UUID
    name: str
    is_dm: bool
    created_by: UUID
    created_at: datetime
    dm_partner: DmPartnerInfo
```

`DmRoomResponse.dm_partner`는 Optional 아님 — DM방이면 항상 있어야 함.

---

## Step 2 — 백엔드 도메인 수정 ✅ 완료

**파일:** `backend/app/domain/room.py`

```python
@dataclass
class RoomEntity:
    id: UUID
    name: str
    is_dm: bool
    created_by: UUID
    created_at: datetime
    dm_partner: UserEntity | None = None
```

---

## Step 3 — 백엔드 CRUD 수정 (직접 작성)

**파일:** `backend/app/crud/room.py`

기존 `get_rooms_by_user`는 그룹방 전용으로 `is_dm == False` 조건 추가.  
DM방 전용 `get_dm_rooms_by_user` 함수 신규 추가 — 상대방 User 정보를 JOIN으로 함께 조회.

```python
# 기존 함수에 is_dm == False 조건 추가
async def get_rooms_by_user(session, user_id) -> list[RoomEntity]:
    # WHERE is_dm == False 조건 추가

# 신규 함수
async def get_dm_rooms_by_user(session, user_id) -> list[RoomEntity]:
    # RoomMember → Room (is_dm == True) JOIN RoomMember JOIN User
    # 상대방(user_id != my_user_id)의 User 정보를 dm_partner로 포함
    # return list[RoomEntity] (dm_partner 채워진 상태)
```

힌트: `get_room_members`처럼 `RoomMember JOIN User`로 상대방 정보를 뽑되,  
Room도 함께 select해서 한 쿼리로 방 정보 + 상대방 정보를 동시에 가져오면 됩니다.

---

## Step 4 — 백엔드 서비스 수정 (직접 작성)

**파일:** `backend/app/services/room.py`

`get_rooms` 는 그룹방 전용으로 유지, `get_dm_rooms` 신규 추가.

```python
async def get_rooms(user_id: UUID, session: AsyncSession) -> list[RoomEntity]:
    return await crud_room.get_rooms_by_user(session=session, user_id=user_id)

async def get_dm_rooms(user_id: UUID, session: AsyncSession) -> list[RoomEntity]:
    return await crud_room.get_dm_rooms_by_user(session=session, user_id=user_id)
```

---

## Step 5 — 백엔드 라우터 수정 (직접 작성)

**파일:** `backend/app/api/routes/rooms.py`

기존 `GET /rooms` 는 그룹방 전용으로 수정, `GET /rooms/dm` 신규 추가.

```python
# 기존 GET /rooms — 그룹방만 반환
@router.get("", response_model=list[RoomResponse], ...)
async def get_rooms(...):
    ...

# 신규 GET /rooms/dm — DM방만 반환
@router.get("/dm", response_model=list[DmRoomResponse], ...)
async def get_dm_rooms(...):
    rooms = await room_service.get_dm_rooms(user_id=current_user.id, session=session)
    return [
        DmRoomResponse(
            id=room.id,
            name=room.name,
            is_dm=room.is_dm,
            created_by=room.created_by,
            created_at=room.created_at,
            dm_partner=DmPartnerInfo(
                id=room.dm_partner.id,
                username=room.dm_partner.username,
            ),
        )
        for room in rooms
    ]
```

`DmRoomResponse`, `DmPartnerInfo` 임포트 추가 잊지 말 것.

주의: `/dm` 라우트는 `/{room_id}` 같은 동적 경로보다 **위에** 등록해야 FastAPI가 먼저 매칭함.

---

## Step 6 — 프론트엔드 타입 및 스토어 (Claude가 작성)

**파일:** `frontend/src/types/index.ts`, `frontend/src/store/chat.ts`

- `DmRoom` 타입 추가: `Room`에 `dm_partner: { id: string; username: string }` 포함
- 스토어에 `dmRooms` 상태 및 `fetchDmRooms` 액션 추가
- `fetchRooms` / `fetchDmRooms` 를 각각 그룹방/DM방 전용으로 분리

---

## Step 7 — 프론트엔드 Sidebar 수정 (Claude가 작성)

**파일:** `frontend/src/components/Chat/Sidebar.tsx`

- "그룹방" 섹션: `rooms` 렌더링 (기존과 동일)
- "DM" 섹션: `dmRooms` 렌더링, 이름은 `room.dm_partner.username`
- 각 섹션에 [+] 버튼 (그룹방 생성 / DM 시작)

---

## 진행 순서

| 순서 | 담당 | 작업 |
|------|------|------|
| 1 | 직접 작성 | `schemas/room.py` — `DmPartnerInfo`, `DmRoomResponse` 추가 ✅ |
| 2 | 직접 작성 | `domain/room.py` — `RoomEntity.dm_partner` 추가 ✅ |
| 3 | 직접 작성 | `crud/room.py` — `get_rooms_by_user` 수정 + `get_dm_rooms_by_user` 추가 |
| 4 | 직접 작성 | `services/room.py` — `get_dm_rooms` 추가 |
| 5 | 직접 작성 | `routes/rooms.py` — `GET /rooms/dm` 추가 |
| 6–7 | Claude | 프론트엔드 타입, 스토어, Sidebar 수정 ✅ |

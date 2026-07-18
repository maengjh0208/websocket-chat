# 채팅방 멤버 패널 구현 계획

## 목표

채팅방 선택 시 해당 방의 멤버 목록과 온라인/오프라인 상태를 보여주는 패널 추가.

## 레이아웃

```
┌──────────┬─────────────────┬────────────┐
│  Sidebar │   ChatWindow    │ MemberPanel│
│  (240px) │   (flex: 1)     │  (200px)  │
│  채팅방  │                 │ 멤버 목록  │
│  친구    │                 │ ● alice    │
│  유저    │                 │ ○ bob      │
└──────────┴─────────────────┴────────────┘
```

채팅방 미선택 시 MemberPanel은 숨김.

---

## Step 1 — 백엔드 CRUD (직접 작성)

**파일:** `backend/app/crud/room.py`

`RoomMember` JOIN `User` 테이블로 현재 멤버(left_at IS NULL) 목록을 반환하는 함수 추가.

```python
async def get_room_members(session: AsyncSession, room_id: UUID) -> list[tuple[UUID, str]]:
    # RoomMember JOIN User, left_at IS NULL
    # return [(user_id, username), ...]
```

참고: 기존 `get_room_member_ids`는 UUID만 반환하므로 별도 함수 필요.

---

## Step 2 — 백엔드 서비스 (직접 작성)

**파일:** `backend/app/services/room.py`

CRUD 결과에 Redis presence 온라인 상태를 붙여서 반환.

```python
async def get_room_members(user_id: UUID, room_id: UUID, session: AsyncSession):
    # 1. is_room_member 체크 (권한 확인 — 방 멤버만 조회 가능)
    # 2. crud.get_room_members 호출
    # 3. 각 멤버별 presence.is_online(user_id) 체크
    # 4. MemberInfo 리스트 반환
```

참고: `presence.is_online`은 `backend/app/managers/presence.py` 확인.

---

## Step 3 — 백엔드 API 엔드포인트 (직접 작성)

**파일:** `backend/app/api/routes/rooms.py`

```
GET /rooms/{room_id}/members
```

응답 스키마 `MemberResponse` 신규 작성 (스키마 파일 위치: `backend/app/schemas/`):

```python
class MemberResponse(BaseModel):
    id: UUID
    username: str
    is_online: bool
```

엔드포인트 패턴은 기존 `GET /rooms/{room_id}/messages`와 동일하게 작성.

---

## Step 4 — 프론트엔드 스토어 (Claude가 작성)

**파일:** `frontend/src/store/chat.ts`

추가 내용:
- `RoomMember` 타입: `{ id: string; username: string; is_online: boolean }`
- `roomMembers: Record<string, RoomMember[]>` 상태
- `fetchRoomMembers(roomId: string)` 액션 — `GET /rooms/{roomId}/members` 호출

---

## Step 5 — 프론트엔드 MemberPanel 컴포넌트 (Claude가 작성)

**파일:** `frontend/src/components/Chat/MemberPanel.tsx` (신규)

- `activeRoomId` 기준으로 멤버 목록 렌더링
- 온라인(초록 dot) / 오프라인(회색 dot) 구분

**온라인 상태 병합 로직:**

```ts
// API 초기값 + WebSocket 실시간 업데이트 우선 적용
const isOnline = online[member.id] ?? member.is_online
```

`online` 상태는 WebSocket `presence.update` 이벤트로 실시간 갱신되므로, store의 값을 우선 사용해야 한다.

---

## Step 6 — 프론트엔드 ChatLayout 수정 (Claude가 작성)

**파일:** `frontend/src/components/Chat/ChatLayout.tsx`

- `MemberPanel` 렌더링 추가 (room 선택된 경우만)
- `activeRoomId` 변경 시 `fetchRoomMembers` 호출

---

## 진행 순서

| 순서 | 담당 | 파일 |
|------|------|------|
| 1 | 직접 작성 | `backend/app/crud/room.py` — `get_room_members` 추가 |
| 2 | 직접 작성 | `backend/app/services/room.py` — `get_room_members` 추가 |
| 3 | 직접 작성 | `backend/app/api/routes/rooms.py` + 스키마 |
| 4–6 | Claude | 프론트엔드 전체 (백엔드 완료 후 한꺼번에) |

백엔드 3단계 완료 후 알려주면 프론트엔드를 작성합니다.

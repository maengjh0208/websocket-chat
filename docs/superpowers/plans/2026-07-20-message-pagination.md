# 채팅 메시지 페이지네이션 (무한 스크롤) 계획

## 목표

현재 최신 50개 메시지만 보임.  
채팅창에서 위로 스크롤하면 이전 메시지를 추가로 불러오는 무한 스크롤 구현.

## 페이지네이션 방식: 커서 기반 (before_id)

```
GET /rooms/{room_id}/messages?before_id=<message_uuid>
```

- `before_id`가 없으면 → 최신 50개 반환 (현재와 동일)
- `before_id`가 있으면 → 해당 메시지보다 이전 메시지 50개 반환

**offset 방식 대신 cursor 방식을 쓰는 이유:**  
새 메시지가 계속 추가되면 offset이 밀려서 중복/누락이 생김.  
cursor(before_id)는 기준 메시지가 고정이므로 안전.

## 흐름

```
사용자가 스크롤을 맨 위로 올림
  → 현재 가장 오래된 메시지의 id를 before_id로 GET 요청
  → 응답 메시지를 기존 목록 앞에 prepend
  → 스크롤 위치를 직전 scrollHeight 기준으로 복원
  → 응답이 50개 미만이면 "더 이상 없음" 표시, 추가 요청 안 함
```

---

## Step 1 — 백엔드 CRUD 수정 (직접 작성)

**파일:** `backend/app/crud/message.py`

`get_messages_by_room`에 `before_id: UUID | None = None` 파라미터 추가.  
`before_id`가 있으면 해당 메시지의 `created_at`보다 이전 메시지만 조회.

```python
async def get_messages_by_room(
    session: AsyncSession,
    room_id: UUID,
    limit: int = 50,
    before_id: UUID | None = None,
) -> list[MessageEntity]:
    query = (
        select(...)
        .where(Message.room_id == room_id)
        ...
    )

    if before_id is not None:
        # before_id에 해당하는 메시지의 created_at을 서브쿼리로 가져옴
        sub = select(Message.created_at).where(Message.id == before_id).scalar_subquery()
        query = query.where(Message.created_at < sub)

    query = query.order_by(Message.created_at.desc()).limit(limit)
    ...
```

결과 리스트는 `[::-1]`로 역순 (오래된 것이 위) — 현재와 동일.

---

## Step 2 — 백엔드 서비스 수정 (직접 작성)

**파일:** `backend/app/services/message.py`

`get_messages`에 `before_id` 파라미터 추가하여 CRUD로 전달.

```python
async def get_messages(
    user_id: UUID,
    room_id: UUID,
    session: AsyncSession,
    before_id: UUID | None = None,
) -> list[MessageEntity]:
    # 권한 체크 (현재 코드 유지)
    ...
    return await crud_message.get_messages_by_room(
        session=session,
        room_id=room_id,
        before_id=before_id,
    )
```

---

## Step 3 — 백엔드 라우터 수정 (직접 작성)

**파일:** `backend/app/api/routes/rooms.py`

`GET /rooms/{room_id}/messages`에 `before_id` 쿼리 파라미터 추가.

```python
from uuid import UUID
from fastapi import Query

@router.get("/{room_id}/messages", ...)
async def get_messages(
    room_id: UUID,
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    before_id: UUID | None = Query(default=None, description="이 메시지 이전 메시지 조회"),
):
    return await message_service.get_messages(
        user_id=current_user.id,
        room_id=room_id,
        session=session,
        before_id=before_id,
    )
```

---

## Step 4 — 프론트엔드 스토어 수정 (Claude가 작성)

**파일:** `frontend/src/store/chat.ts`

- `fetchMessages(roomId)` → 최신 메시지 fetch (방 입장 시, 기존 교체)
- `fetchOlderMessages(roomId)` 신규 → `before_id` 포함 요청, 기존 목록 **앞에 prepend**
- `hasMoreMessages: Record<string, boolean>` 상태 추가 → 50개 미만 응답 시 `false`

---

## Step 5 — 프론트엔드 ChatWindow 수정 (Claude가 작성)

**파일:** `frontend/src/components/Chat/ChatWindow.tsx`

스크롤 이벤트 감지 + 스크롤 위치 복원.

```
메시지 목록 div에 onScroll 핸들러 부착
  scrollTop === 0 이고 hasMoreMessages[roomId] === true 이면
    → 직전 scrollHeight 저장
    → fetchOlderMessages(roomId) 호출
    → fetch 완료 후 scrollHeight 차이만큼 scrollTop 복원
```

로딩 중 중복 요청 방지: `isLoadingMore` 플래그.  
"이전 메시지 없음" 상태일 때 맨 위에 안내 문구 표시.

---

## 진행 순서

| 순서 | 담당 | 작업 |
|------|------|------|
| 1 | 직접 작성 | `crud/message.py` — `before_id` 서브쿼리 조건 추가 |
| 2 | 직접 작성 | `services/message.py` — `before_id` 파라미터 전달 |
| 3 | 직접 작성 | `routes/rooms.py` — `before_id` 쿼리 파라미터 추가 |
| 4–5 | Claude | 프론트엔드 스토어, ChatWindow 수정 |

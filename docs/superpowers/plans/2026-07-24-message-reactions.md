# 메시지 이모지 리액션 구현 계획

## 목표

채팅 메시지 하단에 이모지 리액션(👍 같은)을 달 수 있게 한다.
사용 가능한 이모지는 자유 입력이 아니라 **허용 목록(allow-list)** 안에서만 고르게 하고,
목록은 DB에 저장해서 나중에 배포 없이(행 추가만으로) 확장할 수 있게 한다.

## 기본 제공 이모지 (초기 시드 6종)

| 이모지 | 의미 |
|---|---|
| 👍 | 동의/공감 |
| ❤️ | 애정/좋아요 |
| 😂 | 웃김 |
| 😮 | 놀람 |
| 😢 | 슬픔/위로 |
| 🙏 | 감사/부탁 |

텍스트 대화에서 가장 흔한 반응 유형(공감·애정·웃김·놀람·위로·감사)을 하나씩 커버하도록 골랐다.
Slack, 카카오톡 등에서도 초기 기본 세트로 많이 쓰이는 조합.

---

## 설계

### 테이블 1 — `allowed_reactions` (허용 이모지 목록)

```
id          UUID PK
emoji       String, unique
sort_order  Integer          -- 피커에서 보여줄 순서
is_active   Boolean, default True
created_at  DateTime
```

**`is_active`를 두고 hard delete를 하지 않는 이유:**
나중에 특정 이모지를 목록에서 빼고 싶을 때, 행을 삭제해버리면 이미 그 이모지로 남겨진
과거 `message_reactions` 기록이 참조 무결성 관점에서 붕 뜨게 된다.
`is_active=False`로 비활성화만 하면 "새로 남기는 건 막히지만 과거 기록은 그대로 보이는" 동작이 자연스럽게 된다.

### 테이블 2 — `message_reactions` (실제 리액션 기록)

```
id          UUID PK
message_id  UUID FK -> messages.id, ON DELETE CASCADE
user_id     UUID FK -> users.id
emoji       String              -- allowed_reactions.emoji 값을 그대로 저장 (FK 아님)
created_at  DateTime

UNIQUE (message_id, user_id, emoji)
```

**`emoji`를 `allowed_reactions.id`로 FK 거는 대신 문자열 자체를 복사해서 저장하는 이유:**
허용 목록 쪽 이모지가 나중에 비활성화되더라도 이미 찍힌 리액션은 어떤 이모지였는지 그대로 남아있어야 한다.
FK로 묶어두면 "비활성화됐지만 여전히 참조되는 행"을 신경 써야 하는데, 값만 복사해두면 그 문제가 아예 생기지 않는다.
허용 여부 검증은 저장 시점(서비스 레이어)에서 한 번만 확인하면 충분하다.

**`UNIQUE (message_id, user_id, emoji)`**: 같은 사람이 같은 메시지에 같은 이모지를 중복으로 못 남기게 막는다.
토글(있으면 삭제, 없으면 추가) 로직의 기준이 되는 제약이기도 하다.

### 리액션 상태를 클라이언트에 보내는 방식: 델타(+1/-1)가 아니라 전체 스냅샷

여러 명이 거의 동시에 같은 이모지를 눌렀을 때, `+1`/`-1` 델타 방식이면 클라이언트마다 도착 순서가
달라져서 카운트가 실제와 어긋날 수 있다. 대신 리액션이 바뀔 때마다 **해당 메시지의 이모지별 집계 전체**를
서버가 다시 계산해서 브로드캐스트하면, 클라이언트는 그 값으로 덮어쓰기만 하면 되므로 항상 정확하다.

```
ReactionSummary = { emoji: str, count: int, reacted_by_me: bool }
Message.reactions: list[ReactionSummary]
```

---

## Step 1 — DB 모델 + 마이그레이션 (직접 작성)

**파일:** `backend/app/db/models.py`

`AllowedReaction`, `MessageReaction` 모델 추가 (위 설계 그대로).
Alembic 마이그레이션 생성 후, 기본 이모지 6종을 시드 데이터로 넣는다 (마이그레이션의 `upgrade()` 안에서 `op.bulk_insert` 사용하거나 별도 시드 스크립트).

---

## Step 2 — CRUD 레이어 (직접 작성)

**파일:** `backend/app/crud/reaction.py` (신규)

```python
async def get_allowed_reactions(session: AsyncSession) -> list[AllowedReaction]:
    # is_active=True, sort_order 순 정렬

async def toggle_reaction(
    session: AsyncSession, message_id: UUID, user_id: UUID, emoji: str
) -> bool:
    # 기존 (message_id, user_id, emoji) 행이 있으면 삭제하고 False 반환
    # 없으면 추가하고 True 반환

async def get_reactions_for_message(
    session: AsyncSession, message_id: UUID, current_user_id: UUID
) -> list[ReactionSummary]:
    # message_reactions를 emoji로 GROUP BY, COUNT
    # 각 그룹에 current_user_id가 포함되는지 여부(reacted_by_me)도 같이 계산

async def get_reactions_by_message_ids(
    session: AsyncSession, message_ids: list[UUID], current_user_id: UUID
) -> dict[UUID, list[ReactionSummary]]:
    # 메시지 목록(GET /rooms/{room_id}/messages) 조회 시 배치로 한 번에 가져오기 위함
    # message_id별로 묶어서 반환
```

참고: `get_reactions_by_message_ids`가 필요한 이유는 `services/message.py`의 `get_messages`가
메시지를 리스트로 반환할 때, 각 메시지마다 리액션을 N+1 쿼리로 따로 조회하지 않기 위함.

---

## Step 3 — 서비스 레이어 (직접 작성)

**파일:** `backend/app/services/reaction.py` (신규)

```python
async def toggle_reaction(
    user_id: UUID, message_id: UUID, emoji: str, session: AsyncSession
) -> list[ReactionSummary]:
    # 1. message로부터 room_id 조회 (crud_message에 get_room_id_by_message 같은 조회 필요할 수 있음)
    # 2. is_room_member 체크 (방 멤버만 리액션 가능 — 기존 message 서비스 패턴과 동일)
    # 3. emoji가 allowed_reactions에 있고 is_active=True인지 검증 (아니면 ForbiddenError/ValidationError)
    # 4. crud_reaction.toggle_reaction 호출
    # 5. crud_reaction.get_reactions_for_message로 갱신된 상태 반환 (WS 브로드캐스트용)
```

**파일:** `backend/app/services/message.py` 수정

`get_messages`가 반환하는 각 `MessageEntity`에 `reactions` 필드를 채워 넣도록 수정
(`get_reactions_by_message_ids` 배치 조회 결과를 merge).

---

## Step 4 — REST 엔드포인트 (직접 작성)

**파일:** `backend/app/api/routes/reactions.py` (신규) 또는 기존 라우터에 추가

```
GET /reactions/allowed
```

허용된 이모지 목록(`emoji`, `sort_order`)을 반환. 프론트가 앱 로드 시 한 번 호출해서
리액션 추가 피커에 렌더링할 목록으로 사용.

---

## Step 5 — WebSocket 핸들러 (직접 작성)

**파일:** `backend/app/core/enums.py`

`WSMessageType`에 `REACTION_TOGGLE`(클라이언트→서버), `REACTION_UPDATE`(서버→브로드캐스트) 추가.

**파일:** `backend/app/api/websocket.py`

`MESSAGE_SEND` 분기와 동일한 자리에 새 분기 추가:

```python
elif msg_type == WSMessageType.REACTION_TOGGLE:
    message_id = UUID(payload["message_id"])
    emoji = str(payload.get("emoji", ""))

    # services.reaction.toggle_reaction 호출 (권한 체크 + 허용 목록 검증 + 토글 포함)
    # 실패 시(방 멤버 아님/허용 안 된 이모지) 조용히 continue

    room_id = ...  # message로부터 조회
    reactions = ...  # 갱신된 ReactionSummary 리스트
    member_ids = await crud_room.get_room_member_ids(session, room_id)

    await pubsub.publish({
        "user_ids": [str(uid) for uid in member_ids],
        "payload": {
            "type": WSMessageType.REACTION_UPDATE,
            "message_id": str(message_id),
            "room_id": str(room_id),
            "reactions": [asdict(r) for r in reactions],
        },
    })
```

`MESSAGE_SEND` → `pubsub.publish`로 룸 멤버 전체에게 브로드캐스트하는 기존 패턴을 그대로 재사용한다.

---

## Step 6 — 프론트엔드 타입 + 스토어 (Claude가 작성)

**파일:** `frontend/src/types/index.ts`

```ts
export interface ReactionSummary {
  emoji: string
  count: number
  reacted_by_me: boolean
}

// Message에 reactions 필드 추가
export interface Message {
  ...
  reactions: ReactionSummary[]
}

export interface WSReactionUpdate {
  type: 'reaction.update'
  message_id: string
  room_id: string
  reactions: ReactionSummary[]
}

// WSPayload 유니온에 WSReactionUpdate 추가
```

**파일:** `frontend/src/store/chat.ts`

- `allowedReactions: string[]` 상태 + `fetchAllowedReactions()` 액션 (`GET /reactions/allowed`, 앱 진입 시 1회 호출)
- WS 메시지 핸들러에 `reaction.update` 케이스 추가: `messages[room_id]`에서 `message_id`가 일치하는 메시지를 찾아 `reactions` 필드만 교체
- 리액션 토글 WS 전송 함수 (`sendReaction(messageId, emoji)` 같은 형태로, 기존 `onSendMessage`/`onTypingStart`가 WS로 보내는 지점과 동일한 곳에 추가)

---

## Step 7 — MessageBubble UI (Claude가 작성)

**파일:** `frontend/src/components/Chat/MessageBubble.tsx`

- 버블 호버 시 "리액션 추가" 버튼(+) 노출 → 클릭 시 `allowedReactions` 기반 이모지 피커(작은 팝오버) 표시
- 버블 하단에 리액션이 있으면 이모지별 pill 렌더링: `😂 3` 형태, `reacted_by_me`인 경우 배경색 강조(`--room-active-bg` 등 기존 테마 변수 재사용)
- pill 클릭 시 토글 요청 전송 (이미 반응한 것 클릭 → 취소, 안 한 것 클릭 → 추가)

---

## Step 8 — WS 콜백 연결 (Claude가 작성)

**파일:** `ChatWindow.tsx` 및 그 상위 (WS send 함수가 정의된 곳 — `onSendMessage`/`onTypingStart`를 내려주는 지점과 동일)

`onReact: (messageId: string, emoji: string) => void` prop을 `onSendMessage`와 같은 방식으로 관통시켜 `MessageBubble`까지 전달.

---

## 진행 순서

| 순서 | 담당 | 작업 |
|------|------|------|
| 1 | 직접 작성 | `db/models.py` — `AllowedReaction`, `MessageReaction` 모델 + 마이그레이션 + 시드 |
| 2 | 직접 작성 | `crud/reaction.py` — 허용 목록 조회, 토글, 집계 조회 |
| 3 | 직접 작성 | `services/reaction.py` 신규 + `services/message.py` 수정 |
| 4 | 직접 작성 | `api/routes/reactions.py` — `GET /reactions/allowed` |
| 5 | 직접 작성 | `core/enums.py` + `api/websocket.py` — `REACTION_TOGGLE`/`REACTION_UPDATE` |
| 6–8 | Claude | 프론트엔드 타입, 스토어, `MessageBubble` UI, WS 콜백 연결 (백엔드 완료 후 한꺼번에) |

백엔드 1~5단계 완료 후 알려주시면 프론트엔드를 이어서 작성합니다.

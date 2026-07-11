# Advanced Features Plan

> **새 대화에서 재개 시:** 아래 체크박스 기준으로 완료되지 않은 첫 번째 Task부터 진행한다.
> Task 완료 시 해당 Task의 모든 Step을 `- [x]` 로 체크하고 CLAUDE.md의 "다음 시작 지점"도 업데이트한다.

---

### Task 14: Presence 개선 — 온라인 유저 필터 + _broadcast_presence 수정

**배경:**
현재 `_broadcast_presence`는 `get_peer_user_ids`(공통 방 멤버)를 기준으로 presence 이벤트를 전송한다.
새로 가입한 유저는 아직 공통 방이 없기 때문에 서로의 온라인 상태를 볼 수 없다.
또한 사이드바 유저 목록은 모든 유저를 보여주지만, 온라인 유저만 보이도록 변경한다.

**Files:**
- Modify: `backend/app/managers/presence.py`
- Modify: `backend/app/api/websocket.py`
- Modify: `frontend/src/components/Chat/Sidebar.tsx`

---

#### Step 1: `presence.py`에 `get_all_online_ids()` 추가

Redis `KEYS` 명령으로 `user:*:online` 패턴 전체를 조회해 현재 온라인인 모든 유저 ID를 반환한다.

```python
async def get_all_online_ids() -> list[UUID]:
    keys = await redis_client.keys("user:*:online")
    return [UUID(key.decode().split(":")[1]) for key in keys]
```

> **주의:** `redis_client`가 `decode_responses=True` 없이 생성되었으므로 `key.decode()` 필요.
> 프로덕션에서는 `KEYS` 대신 `SCAN`을 쓴다 (`KEYS`는 Redis를 블로킹함).

- [ ] **Step 1: `presence.py`에 `get_all_online_ids()` 추가**

---

#### Step 2: `websocket.py` `_broadcast_presence` 수정

**변경 전:**
```python
async def _broadcast_presence(session: AsyncSession, user_id: UUID, status: str, is_reconnect: bool = False) -> None:
    peer_ids = await crud_room.get_peer_user_ids(session, user_id)
    online_peer_ids = await presence.get_online_peer_ids(peer_ids)
    ...
```

**변경 후:**
```python
async def _broadcast_presence(user_id: UUID, status: str, is_reconnect: bool = False) -> None:
    all_online_ids = await presence.get_all_online_ids()
    target_ids = [uid for uid in all_online_ids if uid != user_id]

    await manager.broadcast_to_users(
        user_ids=target_ids,
        payload={
            "type": WSMessageType.PRESENCE_UPDATE,
            "user_id": str(user_id),
            "status": status,
        },
    )

    if is_reconnect:
        for peer_id in target_ids:
            await manager.send_to_user(
                user_id=user_id,
                payload={
                    "type": WSMessageType.PRESENCE_UPDATE,
                    "user_id": str(peer_id),
                    "status": PresenceStatus.ONLINE,
                },
            )
```

호출부 2곳에서도 `session=session` 제거:
- 연결 시: `await _broadcast_presence(user_id=user.id, status=PresenceStatus.ONLINE, is_reconnect=True)`
- 종료 시: `await _broadcast_presence(user_id=user.id, status=PresenceStatus.OFFLINE)`

> **왜 Redis를 쓰는가?** `manager.connections.keys()`로도 현재 서버에서는 동일하게 동작하지만,
> 서버가 여러 대일 때는 각 서버의 connections가 서로 다르다. Redis는 모든 서버가 공유하는 온라인 상태 저장소이므로 Redis에서 가져오는 것이 개념적으로 올바르다. (실제 다중 서버 delivery는 Task 16 참고)

- [ ] **Step 2: `_broadcast_presence` 수정 + 호출부 2곳 수정**

---

#### Step 3: 프론트 — 유저 목록 온라인 필터링

`is_reconnect=True` 스냅샷으로 접속 시 현재 온라인인 모든 유저 상태가 Zustand `online` state에 쌓인다.
이를 이용해 사이드바 유저 목록을 필터링한다.

```tsx
// Sidebar.tsx
{users.filter(u => online[u.id] === true && u.id !== user?.id).map(u => (
  <div key={u.id} style={styles.userItem}>
    <span style={{ ...styles.statusDot, background: '#22c55e' }} />
    <span style={styles.userName}>{u.username}</span>
  </div>
))}
```

- [ ] **Step 3: Sidebar 유저 목록 온라인 필터 적용**

---

### Task 15: 친구 목록 기능

**목표:**
- 친구 신청 / 수락 기능
- 사이드바에 "친구" 섹션 추가 (온라인/오프라인 모두 표시)
- 채팅방 목록과 온라인 유저 목록 사이에 배치

**사이드바 최종 레이아웃:**
```
┌─────────────────┐
│ 내 정보 / 로그아웃 │
├─────────────────┤
│ 채팅방           │
│  # general      │
│  👤 alice       │
├─────────────────┤
│ 친구             │  ← Task 15
│  🟢 alice       │
│  ⚫ bob         │
├─────────────────┤
│ 온라인 유저       │  ← Task 14에서 온라인만 표시
│  🟢 charlie     │
└─────────────────┘
```

---

#### 백엔드 (직접 작성)

**새 테이블 `friends`:**

```python
class Friend(Base):
    __tablename__ = "friends"

    requester_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    addressee_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    status: Mapped[str]  # "pending" | "accepted"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

**엔드포인트 설계:**

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/friends/requests` | 친구 신청 `{ target_id: uuid }` |
| `GET` | `/friends/requests/received` | 받은 신청 목록 |
| `POST` | `/friends/requests/{requester_id}/accept` | 수락 |
| `GET` | `/friends` | 수락된 친구 목록 (온라인 상태 포함) |
| `DELETE` | `/friends/{friend_id}` | 친구 삭제 |

**레이어 작업 순서:**
1. `db/models.py` → `Friend` 모델 추가
2. Alembic migration
3. `crud/friend.py` → DB 쿼리 레이어
4. `services/friend.py` → 비즈니스 로직 (중복 신청 방지, 이미 친구 여부 확인)
5. `api/routes/friends.py` → 엔드포인트
6. `main.py` → 라우터 등록

- [ ] **Step 1: `Friend` 모델 추가 + Alembic migration**
- [ ] **Step 2: `crud/friend.py` 작성**
- [ ] **Step 3: `services/friend.py` 작성**
- [ ] **Step 4: `api/routes/friends.py` 작성 + `main.py` 등록**

---

#### 프론트 (Claude 작성)

- [ ] **Step 5: `types/index.ts` — `Friend`, `FriendRequest` 타입 추가**
- [ ] **Step 6: `store/friend.ts` — 친구 목록 Zustand store**
- [ ] **Step 7: `Sidebar.tsx` — 친구 섹션 추가**
  - 유저 목록 아이템에 "친구 신청" 버튼 추가
  - 친구 섹션에서 온라인(🟢) / 오프라인(⚫) 상태 표시
  - 받은 친구 신청 알림 뱃지

---

### Task 16: 다중 서버 아키텍처 — Redis Pub/Sub + Nginx 로드밸런싱

**목표:** 백엔드 서버가 여러 대일 때 WebSocket 메시지가 올바르게 전달되도록 구성하고, 로컬에서 이를 테스트한다.

---

#### 개념 이해

**문제 상황: 서버가 2대일 때**

```
클라이언트 A → 서버1 (manager.connections에 A 있음)
클라이언트 B → 서버2 (manager.connections에 B 있음)

A가 메시지를 보내면:
  서버1: B에게 전달하려고 manager.connections 조회 → B 없음 → 전달 실패
```

**Redis만 쓸 때 (현재 방식):**

```
Redis: { "user:A:online": 1, "user:B:online": 1 }  # 누가 온라인인지는 알 수 있음
서버1: B에게 보내려고 manager.connections 조회 → B 없음 → 전달 불가
```

Redis는 "누가 온라인인지"는 알지만, 실제 WebSocket 전달은 각 서버의 connections에서만 가능하다.

**Redis Pub/Sub을 쓸 때:**

```
A → 서버1: "B에게 메시지 보내줘"
서버1 → Redis channel "chat": { to: B, payload: ... }  # publish
서버2 → Redis channel "chat" 구독 중 → 수신 → B에게 전달  # subscribe
```

Redis를 메시지 버스로 사용해 서버 간 통신을 가능하게 한다.

| | Redis (현재) | Redis Pub/Sub |
|--|-------------|--------------|
| 온라인 상태 저장 | ✅ | ✅ |
| 서버 간 메시지 전달 | ❌ | ✅ |
| 복잡도 | 낮음 | 중간 |
| 적합한 경우 | 단일 서버 | 다중 서버 |

---

#### Nginx와 로드밸런싱

서버가 여러 대이면 클라이언트의 요청을 분산해야 한다. 이때 Nginx가 리버스 프록시 + 로드밸런서 역할을 한다.

**WebSocket에서 주의할 점 — sticky session:**

HTTP REST API는 어느 서버로 가도 무관하지만, WebSocket은 연결이 유지되는 동안 **같은 서버로** 가야 한다.

```nginx
upstream backend {
    ip_hash;  # 같은 IP는 항상 같은 서버로 (sticky session)
    server backend1:8000;
    server backend2:8000;
}

server {
    location /ws {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        proxy_pass http://backend;
    }
}
```

> `ip_hash`: 클라이언트 IP 기반으로 항상 같은 서버로 라우팅. 단점: 특정 IP에 트래픽 몰림.
> 대안: `consistent_hash $cookie_session` (세션 쿠키 기반)

---

#### 로컬 테스트 방법

Docker Compose로 백엔드를 2개 인스턴스로 올리고 Nginx를 앞에 둔다.

**`docker-compose.scale.yml`:**

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - backend

  backend:
    build: ./backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000
    environment:
      DATABASE_URL: postgresql+asyncpg://...
      REDIS_URL: redis://redis:6379
    deploy:
      replicas: 2  # 2개 인스턴스

  redis:
    image: redis:7-alpine

  db:
    image: postgres:16-alpine
```

실행:
```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml up --scale backend=2
```

확인:
```bash
# 어느 서버로 연결됐는지 확인 (서버마다 다른 로그 prefix)
docker compose logs backend
```

**테스트 시나리오:**
1. 브라우저 A → 서버1에 WebSocket 연결
2. 브라우저 B → 서버2에 WebSocket 연결
3. A가 메시지 전송 → B에게 도달하는지 확인
4. Redis Pub/Sub 없이: 도달 안 함 (버그 확인)
5. Redis Pub/Sub 추가 후: 도달함 (수정 확인)

---

#### 구현 계획

- [ ] **Step 1: `docker-compose.scale.yml` + `nginx.conf` 작성**
- [ ] **Step 2: 2개 서버로 올려서 "메시지 전달 실패" 재현**
- [ ] **Step 3: `managers/pubsub.py` 작성 — Redis Pub/Sub 구독/발행 로직**
  ```python
  # publish: 다른 서버에 있는 유저에게 보낼 메시지를 Redis channel에 발행
  # subscribe: Redis channel 구독 → 내 서버 connections에 있는 유저에게 전달
  ```
- [ ] **Step 4: `websocket.py` — broadcast 시 Redis Pub/Sub 경유하도록 수정**
- [ ] **Step 5: 2개 서버 상태에서 메시지 전달 정상 동작 확인**

# WebSocket 연결 안정성 보강 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render 배포 환경에서 확인된 "불필요한 재연결" 문제를 해결한다 — 백엔드가 유저당 다중 WebSocket 연결(멀티탭)을 지원하도록 하고, 프론트 heartbeat가 1회 실패만으로 죽은 연결로 오판하지 않도록 유예를 두며, 재연결 시 안읽음 카운트도 복구한다.

**Architecture:** 백엔드 `ConnectionManager.connections`를 `dict[UUID, WebSocket]`에서 `dict[UUID, set[WebSocket]]`로 바꿔 멀티탭을 지원한다. 프론트 `useWebSocket.ts`의 heartbeat에 연속 실패 카운터를 추가하고, 재연결 복구 로직에 방 목록 재조회를 추가한다.

**Tech Stack:** 백엔드는 FastAPI WebSocket + 순수 Python(외부 라이브러리 추가 없음), 프론트는 기존과 동일(React, TypeScript).

## Global Constraints

- **Task 1(백엔드)은 Claude가 코드를 직접 작성하지 않는다** (`CLAUDE.md` 규칙). 이 플랜을 실행하는 주체(사람이든 에이전트든)는 Task 1의 코드 블록을 참고 자료로만 사용자에게 제시하고, 실제 파일 수정은 사용자가 직접 하도록 안내한 뒤, 사용자가 완료했다고 알려주면 그 결과를 리뷰한다. Task 1을 대신 작성해서는 안 된다.
- 프론트는 자동화 테스트 프레임워크가 없다(`frontend/package.json`에 vitest/jest 없음). 검증은 `npx tsc --noEmit` + `npm run build`, 최종 동작은 브라우저 수동 테스트로 한다.
- heartbeat 파라미터: 30초마다 ping, pong 미수신 10초 후 실패 카운트, **연속 2회 실패**해야 죽은 연결로 판단.

---

### Task 1: 백엔드 — `ConnectionManager` 다중 연결(멀티탭) 지원

**Files:**
- Modify: `backend/app/managers/connection.py` (전체, **사용자 직접 작성**)

**Interfaces:**
- Consumes: 없음 (기존 public 메서드 시그니처 `connect(user_id, websocket)`, `disconnect(user_id, websocket)`, `is_online(user_id) -> bool`, `send_to_user(user_id, payload)`, `broadcast_to_users(user_ids, payload, exclude_user_id=None)` 그대로 유지 — 호출부인 `backend/app/api/websocket.py`는 수정 불필요)
- Produces: 내부 저장 구조만 `dict[UUID, WebSocket]` → `dict[UUID, set[WebSocket]]`로 변경

현재 `connections: dict[UUID, WebSocket]`은 유저 1명당 소켓 1개만 추적해서, 같은 유저가 탭을 2개 열면 나중 연결이 먼저 연결을 덮어쓴다. 그 결과 먼저 연결된 탭은 pong을 포함한 모든 서버 push를 못 받고, heartbeat가 그걸 죽은 연결로 오판해서 계속 재연결시킨다.

- [ ] **Step 1: 아래 코드를 참고해서 `backend/app/managers/connection.py`를 직접 수정**

(다시 한번 강조: 이 코드는 참고용 목표 형태이고, 실제 타이핑은 사용자가 한다.)

```python
from uuid import UUID
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # 유저 1명당 여러 개의 WebSocket을 추적 (탭/기기 여러 개 동시 접속 지원)
        self.connections: dict[UUID, set[WebSocket]] = {}

    def connect(self, user_id: UUID, websocket: WebSocket) -> None:
        # 클라이언트가 WebSocket 연결을 맺으면 호출됨. DB나 네트워크 IO가 없으니까 동기(def)로도 충분.
        self.connections.setdefault(user_id, set()).add(websocket)

    def disconnect(self, user_id: UUID, websocket: WebSocket) -> None:
        # 브라우저를 닫거나 네트워크가 끊기면 호출됨
        sockets = self.connections.get(user_id)
        if sockets is None:
            return
        sockets.discard(websocket)
        if not sockets:
            self.connections.pop(user_id, None)

    def is_online(self, user_id: UUID) -> bool:
        # 접속 여부. set이 비어있으면 애초에 dict에서 제거되므로(disconnect에서),
        # 키가 존재한다는 것 자체가 소켓이 1개 이상 있다는 뜻
        return user_id in self.connections

    async def send_to_user(self, user_id: UUID, payload: dict) -> None:
        # 특정 유저의 모든 연결(탭/기기)에 메세지 보냄
        sockets = self.connections.get(user_id)
        if not sockets:
            return

        # 순회 중에 set을 직접 수정하면 안 되므로, 끊긴 소켓은 따로 모았다가 순회가 끝난 후 제거
        dead: set[WebSocket] = set()
        for websocket in sockets:
            try:
                await websocket.send_json(payload)
            except Exception:
                dead.add(websocket)

        for websocket in dead:
            sockets.discard(websocket)
        if not sockets:
            self.connections.pop(user_id, None)

    async def broadcast_to_users(
        self,
        user_ids: list[UUID],
        payload: dict,
        exclude_user_id: UUID | None = None,
    ) -> None:
        for user_id in user_ids:
            if user_id == exclude_user_id:
                continue

            await self.send_to_user(user_id, payload)


manager = ConnectionManager()
```

호출부(`backend/app/api/websocket.py`)는 전부 `manager.connect(...)`, `manager.disconnect(...)`, `manager.is_online(...)`, `manager.send_to_user(...)`, `manager.broadcast_to_users(...)` 같은 public 메서드만 사용하고 있어서(직접 `manager.connections`를 건드리는 곳 없음, 코드베이스 전체 검색으로 확인됨) **이 파일 하나만 바꾸면 되고 다른 파일은 수정할 필요 없다**.

- [ ] **Step 2: 백엔드 컨테이너 재시작 후 import 확인**

Run: `docker compose restart backend && docker compose exec backend python -c "from app.managers.connection import manager; print(type(manager.connections))"`
Expected: 에러 없이 `<class 'dict'>` 출력

- [ ] **Step 3: 멀티탭 동작 확인 (브라우저 수동 테스트)**

같은 계정으로 브라우저 탭 2개(또는 일반창 + 시크릿창)를 열고 같은 방에 입장. 한쪽 탭에서 메시지를 보내면 양쪽 탭 모두에 `message.new`가 도착하는지 확인. 개발자도구 Network 탭에서 양쪽 탭의 WS 프레임을 각각 관찰해서, 두 탭 모두 정상적으로 ping을 보내고 pong을 받는지(한쪽만 계속 재연결되지 않는지) 확인.

- [ ] **Step 4: 커밋**

```bash
git add backend/app/managers/connection.py
git commit -m "fix: backend - ConnectionManager가 유저당 다중 WebSocket 연결(멀티탭)을 지원하도록 수정"
```

---

### Task 2: 프론트 — heartbeat 연속 실패 유예

**Files:**
- Modify: `frontend/src/hooks/useWebSocket.ts`

**Interfaces:**
- Consumes: Task 2 이전에 이미 존재하는 `startHeartbeat(ws)`, `pongTimeoutRef`, `ws.onmessage`의 `payload.type === 'pong'` 분기
- Produces: `missedPongCountRef` — 이 태스크 안에서만 쓰이고 다른 태스크에서 참조하지 않음

지금은 ping을 보내고 10초 안에 pong이 없으면 그 즉시 연결을 강제로 닫는다. 백엔드 멀티탭 문제를 고치더라도, 프로덕션 네트워크(Render의 리버스 프록시 등 로컬보다 홉이 많음)에서 어쩌다 한 번 프레임이 지연되는 경우까지 대비하려면, 1번 실패만으로 바로 죽었다고 판단하지 않는 편이 안전하다.

- [ ] **Step 1: `MAX_MISSED_PONGS` 상수 추가**

`PONG_TIMEOUT_MS` 선언 바로 아래에 추가:

```ts
const MAX_MISSED_PONGS = 2 // 연속으로 이 횟수만큼 pong을 못 받아야 죽은 연결로 판단
```

- [ ] **Step 2: `missedPongCountRef` 추가**

`pongTimeoutRef` 선언 바로 아래에 추가:

```ts
  const missedPongCountRef = useRef(0)
```

- [ ] **Step 3: `startHeartbeat`에서 heartbeat 시작 시 카운터 리셋 + 실패 시 카운트만 증가하도록 변경**

`startHeartbeat` 함수 전체를 아래로 교체:

```ts
    const startHeartbeat = (ws: WebSocket) => {
      missedPongCountRef.current = 0 // 매 연결마다 새로 시작 (이전 연결의 실패 이력을 물려받지 않음)
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ type: 'ping' }))
        // pong이 10초 안에 안 오더라도 바로 죽었다고 판단하지 않는다. 프로덕션 네트워크에서는
        // 어쩌다 한 번 프레임이 늦는 경우가 있을 수 있어서, 연속으로 MAX_MISSED_PONGS번
        // 실패해야만 소켓이 사실상 죽은 것으로 간주하고 강제로 닫는다.
        pongTimeoutRef.current = setTimeout(() => {
          missedPongCountRef.current += 1
          console.warn(`[WS] pong 타임아웃 (연속 ${missedPongCountRef.current}/${MAX_MISSED_PONGS})`)
          if (missedPongCountRef.current >= MAX_MISSED_PONGS) {
            console.warn('[WS] 연속 pong 누락 — 연결을 강제로 닫고 재연결합니다')
            ws.close()
          }
        }, PONG_TIMEOUT_MS)
      }, PING_INTERVAL_MS)
    }
```

- [ ] **Step 4: pong 수신 시 카운터도 같이 리셋**

`ws.onmessage` 안의 pong 분기를 아래로 교체:

```ts
        if (payload.type === 'pong') {
          missedPongCountRef.current = 0
          if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current)
          return
        }
```

- [ ] **Step 5: 타입 체크로 검증**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/hooks/useWebSocket.ts
git commit -m "fix: frontend - heartbeat가 연속 2회 pong 실패해야 재연결하도록 유예 추가"
```

---

### Task 3: 프론트 — 재연결 시 안읽음 카운트 복구

**Files:**
- Modify: `frontend/src/hooks/useWebSocket.ts`

**Interfaces:**
- Consumes: `useChatStore.getState().fetchRooms(): Promise<void>`, `useChatStore.getState().fetchDmRooms(): Promise<void>` (기존 스토어 함수, 신규 아님 — 둘 다 각각 `GET /rooms`, `GET /rooms/dm`으로 안읽음 카운트를 포함한 방 목록 전체를 다시 받아온다)

지금 재연결 복구는 지금 보고 있는 방의 메시지만 다시 조회(`fetchMessages`)하고, 사이드바의 다른 방 안읽음 카운트는 갱신하지 않는다. 끊긴 동안 다른 방에 도착한 메시지의 안읽음 표시가 반영되지 않는 버그다.

- [ ] **Step 1: `ws.onopen`의 재연결 복구 로직에 `fetchRooms`/`fetchDmRooms` 추가**

`ws.onopen` 안의 아래 블록을:

```ts
        if (retryCountRef.current > 0) {
          const { activeRoomId, fetchMessages } = useChatStore.getState()
          if (activeRoomId) fetchMessages(activeRoomId)
        }
```

아래로 교체:

```ts
        if (retryCountRef.current > 0) {
          const { activeRoomId, fetchMessages, fetchRooms, fetchDmRooms } = useChatStore.getState()
          if (activeRoomId) fetchMessages(activeRoomId)
          fetchRooms()
          fetchDmRooms()
        }
```

- [ ] **Step 2: 타입 체크 + 빌드로 검증**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: 에러 없음, 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/hooks/useWebSocket.ts
git commit -m "fix: frontend - 재연결 시 다른 방 안읽음 카운트도 복구"
```

---

### Task 4: 전체 통합 수동 테스트

**Files:** 없음 (브라우저에서 전체 흐름 검증)

- [ ] **Step 1: 멀티탭 안정성**

같은 계정으로 탭 2개를 열고 5분 이상 그대로 둔 채 관찰. 어느 한쪽도 불필요하게 재연결되지 않는지(콘솔에 `[WS] ... 재연결 시도` 로그가 안 찍히는지) 확인.

- [ ] **Step 2: heartbeat 유예 동작**

`PONG_TIMEOUT_MS`를 임시로 매우 짧게(예: `1`)로 바꾸고 브라우저에서 테스트 → 콘솔에 `pong 타임아웃 (연속 1/2)`가 찍히지만 바로 재연결되지 않고, 다음 주기에도 실패하면 `연속 2/2`에서 재연결되는지 확인. 확인 후 **반드시 `10 * 1000`으로 원복**.

- [ ] **Step 3: 재연결 시 안읽음 카운트 복구**

브라우저 A에서 방 1을 연 채로 `docker compose restart backend`로 연결을 끊고, 재연결 대기 중에 브라우저 B로 방 2(브라우저 A도 속한 다른 방)에 메시지 전송 → 브라우저 A가 재연결되면 사이드바의 방 2 안읽음 뱃지가 올라가 있는지 확인.

- [ ] **Step 4: Render 배포 재확인**

Task 1~3이 모두 배포된 뒤, 실제 Render 환경에서 다시 한번 탭 1개로 30분 이상 두고 콘솔을 관찰해서 더 이상 불필요한 재연결이 발생하지 않는지 확인.

- [ ] **Step 5: 문제 없으면 최종 커밋 없음**

이 태스크는 검증 전용이라 코드 변경이 없다. 문제가 발견되면 해당 태스크로 돌아가 수정 후 다시 커밋한다.

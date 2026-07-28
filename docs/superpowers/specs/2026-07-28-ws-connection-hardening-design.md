# WebSocket 연결 안정성 보강 — 설계 문서

**작성일:** 2026-07-28
**상태:** 승인됨

---

## 1. 배경 및 목표

앞서 구현한 WebSocket 자동 재연결/heartbeat(`docs/superpowers/specs/2026-07-28-ws-reconnect-design.md`)를 Render 배포 환경에서 실제로 테스트하는 과정에서, 재연결이 불필요하게 자주 발생하는 문제를 발견했다. 원인을 진단한 결과 두 가지가 확인되었다.

1. **백엔드 `ConnectionManager`가 유저 1명당 WebSocket 연결을 1개만 추적**하도록 되어 있어, 같은 유저가 탭 2개를 열면 나중에 연결된 탭이 먼저 연결된 탭의 자리를 덮어쓴다. 그 결과 먼저 연결된 탭은 pong을 포함한 모든 서버 push를 못 받게 되고, heartbeat 타임아웃으로 강제 재연결된다. 재연결하면 이번엔 반대쪽 탭이 밀려나는 식으로 두 탭이 번갈아 서로를 밀어낸다. (로컬에서 순수 WebSocket 클라이언트로 직접 ping 5회를 보내 전부 20ms 이내 정상 응답을 확인했고, 연결이 1개일 때는 문제가 재현되지 않아 백엔드의 ping/pong 로직 자체는 정상임을 확인했다.)
2. **heartbeat가 단 1회 pong 실패만으로 즉시 연결을 죽은 것으로 판단**하도록 설계되어 있어, 위 1번 문제뿐 아니라 프로덕션 네트워크(Render의 리버스 프록시/로드밸런서 등 로컬보다 많은 홉을 거침)에서 어쩌다 한 번 프레임이 지연되는 경우까지 전부 죽은 연결로 오판한다.

추가로, 재연결 스펙 작성 당시엔 놓쳤던 별개의 작은 버그도 이번에 같이 고친다.

3. 재연결 성공 시 지금 보고 있는 방의 메시지만 다시 조회(`fetchMessages`)하고, 사이드바의 다른 방 안읽음 카운트(`fetchRooms`/`fetchDmRooms`)는 갱신하지 않아서, 끊긴 동안 다른 방에 도착한 메시지의 안읽음 표시가 반영되지 않는다.

**범위 밖:** Rate limiting, 부하 테스트는 별도 스펙으로 진행한다(`CLAUDE.md` 진행 상황 참고).

---

## 2. 백엔드 — 유저당 다중 WebSocket 연결 지원

### 현재 구조

```python
class ConnectionManager:
    def __init__(self):
        self.connections: dict[UUID, WebSocket] = {}

    def connect(self, user_id: UUID, websocket: WebSocket) -> None:
        self.connections[user_id] = websocket  # 새 연결이 기존 걸 덮어씀
```

`connect`가 단순 대입이라, 같은 `user_id`로 두 번째 연결이 들어오면 첫 번째 연결의 참조를 잃는다. `send_to_user`는 `connections.get(user_id)`로 딱 하나의 소켓만 찾아서 보내므로, 유실된 연결은 이후 어떤 push도 받지 못한다.

### 변경 방향

`connections`의 값 타입을 `WebSocket` 단일값에서 `set[WebSocket]`(유저 1명당 여러 소켓)로 바꾼다.

- `connect(user_id, websocket)`: 해당 유저의 set에 `add`. 유저의 첫 연결이면 새 set을 만들어서 등록.
- `disconnect(user_id, websocket)`: 해당 유저의 set에서 `discard`. set이 비면 유저 항목 자체를 dict에서 제거(메모리 누수 방지).
- `is_online(user_id)`: `user_id in self.connections`는 그대로 유지(set이 있으면 온라인).
- `send_to_user(user_id, payload)`: 해당 유저의 set에 있는 **모든** 소켓에 순회하며 전송. 전송 중 예외(연결이 이미 끊어진 소켓)가 나면 그 소켓만 set에서 제거하고 나머지는 계속 전송.

이렇게 하면 탭을 여러 개 열어도 각 탭이 독립적인 소켓으로 계속 추적되고, 모든 탭이 동일하게 push를 받는다(가장 흔한 채팅 앱의 멀티탭/멀티디바이스 지원 방식).

이 부분은 백엔드 코드라 Claude가 직접 작성하지 않고, 계획 문서에 단계별 가이드로 남긴다.

---

## 3. 프론트 — heartbeat 연속 실패 유예

### 현재

```ts
pongTimeoutRef.current = setTimeout(() => {
  ws.close() // 1번이라도 실패하면 즉시 강제 종료
}, PONG_TIMEOUT_MS)
```

### 변경

연속 실패 횟수를 세는 카운터(`missedPongCountRef`)를 추가한다.

```
MAX_MISSED_PONGS = 2

ping 전송 → 10초 안에 pong 없음 → missedPongCountRef += 1
  missedPongCountRef >= 2 → 죽은 연결로 판단, 강제 종료
  아직 2 미만 → 그냥 다음 주기를 기다림 (재연결 트리거 안 함)

pong 도착 → missedPongCountRef = 0 으로 리셋
```

진짜 죽은 연결은 다음 주기에도 계속 실패하므로 결국 잡히고(최악의 경우 최대 두 번째 주기, 약 40~70초 이내), 어쩌다 한 번 프레임이 늦는 경우는 다음 정상 응답에서 바로 카운터가 리셋되어 불필요한 재연결로 이어지지 않는다.

`missedPongCountRef`는 연결이 바뀔 때마다(재연결 성공 시) 0부터 다시 시작해야 하므로, `startHeartbeat` 호출 시점에 리셋한다.

---

## 4. 프론트 — 재연결 시 안읽음 카운트 복구

`ws.onopen`에서 재연결 판별 후 실행하는 복구 로직에 `fetchRooms()`/`fetchDmRooms()` 호출을 추가한다. 두 함수 모두 `useChatStore`에 이미 존재하며 각각 `GET /rooms`, `GET /rooms/dm`으로 방 목록 전체(안읽음 카운트 포함)를 다시 받아온다.

```ts
if (retryCountRef.current > 0) {
  const { activeRoomId, fetchMessages, fetchRooms, fetchDmRooms } = useChatStore.getState()
  if (activeRoomId) fetchMessages(activeRoomId)
  fetchRooms()
  fetchDmRooms()
}
```

---

## 5. 테스트 방법

- **백엔드 멀티 연결**: 같은 계정으로 브라우저 탭 2개(또는 일반창+시크릿창)를 열고 각각 개발자도구 Network 탭에서 WS 프레임을 관찰. 한쪽에서 메시지를 보내면 양쪽 탭 모두에 `message.new`가 도착하는지, ping/pong이 양쪽 다 정상 응답받는지(어느 한쪽만 계속 재연결되지 않는지) 확인.
- **heartbeat 유예**: 콘솔 로그에서 `missedPongCountRef` 관련 경고가 1번만 찍히고 다음 주기에 정상 pong이 오면 재연결로 이어지지 않는지 확인. (의도적으로 재현하려면 `PONG_TIMEOUT_MS`를 아주 짧게(예: 100ms) 임시로 낮춰서 1번은 실패하고 2번째도 실패해야 재연결되는지 로그로 확인 후 원복)
- **안읽음 복구**: 브라우저 A에서 방 1을 연 채로 `docker compose restart backend`로 연결을 끊고, 재연결 대기 중에 브라우저 B로 방 2(브라우저 A가 속한 다른 방)에 메시지 전송 → 브라우저 A가 재연결되면 사이드바의 방 2 안읽음 뱃지가 올라가 있는지 확인.

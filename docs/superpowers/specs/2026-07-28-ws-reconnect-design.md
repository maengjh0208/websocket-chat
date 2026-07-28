# WebSocket 자동 재연결 (Exponential Backoff) — 설계 문서

**작성일:** 2026-07-28
**상태:** 승인됨

---

## 1. 배경 및 목표

현재 `frontend/src/hooks/useWebSocket.ts`는 `ws.onclose`에서 콘솔 로그만 남기고 아무 것도 하지 않는다.
WebSocket은 HTTP와 달리 한 번 handshake로 연결을 맺으면 그 연결을 계속 유지하는 방식이라, 연결이 한 번 끊기면(네트워크 불안정, 서버 재배포, 노트북 슬립 등) 사용자가 브라우저를 새로고침하기 전까지는 어떤 실시간 이벤트도 받을 수 없다.

이 스펙은 다음 세 가지를 다룬다.
1. 연결이 끊겼을 때 지수 백오프로 자동 재연결
2. 소켓은 열려 있지만 실제로는 죽어 있는 상태(heartbeat 타임아웃)를 감지해서 강제로 재연결 트리거
3. 재연결 중 상태를 사용자에게 배너로 알리고, 재연결 성공 시 놓친 데이터를 복구

**범위 밖:** 서버가 끊긴 동안 발생한 이벤트를 서버가 큐잉했다가 재전송하는 것(백엔드 작업, 별도 스펙 없이 이번엔 진행 안 함). 이 스펙은 순수 프론트엔드 작업이다.

---

## 2. 접근 방식

방식 A(채택): 훅 내부에 재연결 상태 머신을 직접 구현. 외부 라이브러리(`reconnecting-websocket` 등) 없이 순수 로직으로 작성한다.

이 프로젝트는 WebSocket 개념을 직접 학습하는 것이 목적이라(`CLAUDE.md`), 백오프·heartbeat 로직을 라이브러리 뒤로 숨기면 오히려 학습 가치가 떨어진다고 판단했다. 코드량은 조금 늘지만 handshake → 유지 → 재시도 → 해제라는 생명주기를 코드로 그대로 볼 수 있다는 게 이 프로젝트의 방향과 맞다.

---

## 3. 지수 백오프

```
baseDelay = 1000ms
factor = 2
maxDelay = 30000ms
delay = min(baseDelay * factor^retryCount, maxDelay) * (0.8 ~ 1.2 랜덤 지터)
```

1초 → 2초 → 4초 → 8초 → 16초 → 30초(cap) → 30초 ... 최대 지연 상한(30초)만 두고 무한 재시도한다. 지터는 여러 클라이언트가 동시에 끊겼다가 동시에 재연결을 시도해 서버에 요청이 몰리는 상황(thundering herd)을 완화하기 위한 것으로, 지금 사용자 규모에서는 체감되지 않지만 실무에서 그대로 쓸 수 있는 습관으로 넣어둔다.

재연결 성공(`onopen`) 시 `retryCountRef.current`를 0으로 리셋한다 — 그래야 다음에 다시 끊겼을 때 1초부터 다시 시작한다.

`token`이 바뀌거나(로그아웃) 컴포넌트가 언마운트되면 예약된 재연결 타이머(`reconnectTimeoutRef`)를 반드시 정리(`clearTimeout`)한다. 정리하지 않으면 로그아웃 후에도 백그라운드에서 재연결 시도가 계속 발생할 수 있다.

---

## 4. Heartbeat (dead 연결 감지)

브라우저 네이티브 WebSocket은 서버가 명시적으로 끊거나 TCP 레벨 에러가 나야 `onclose`가 발생한다. 노트북 슬립 후 깨어남, 모바일 네트워크 전환(wifi ↔ LTE)처럼 "소켓 객체는 열려 있지만 실제로는 응답이 없는" 상태는 `onclose` 없이는 감지되지 않는다. 이를 잡기 위해 애플리케이션 레벨 heartbeat를 둔다.

```
30초마다 ping 전송 (기존 2분 간격에서 단축)
ping을 보낼 때마다 10초짜리 워치독 타이머 시작
pong 도착 → 워치독 타이머 취소 (연결 생존 확인됨)
워치독 타이머 만료 (10초 내 pong 없음) → ws.close() 강제 호출
```

`ws.close()`를 직접 호출하면 브라우저가 `onclose` 이벤트를 발생시키므로, 재연결 스케줄링 로직을 별도로 중복 작성할 필요 없이 기존 `onclose` 핸들러 경로를 그대로 탄다.

기존 2분 ping은 백엔드 presence TTL 갱신이 목적이었는데, 이번에 30초로 단축하면서 "연결 생존 확인" 역할까지 겸하게 된다. **백엔드 확인 필요:** presence TTL이 30초보다 충분히 여유 있게 설정되어 있는지 확인해야 한다(예: TTL 60초 이상). 이 부분은 백엔드 코드라 가이드로 안내하고 사용자가 직접 확인/수정한다.

프론트는 현재 `pong` 메시지 타입 자체를 처리하지 않는다(`WSPayload` 유니온에 없음). 이번에 추가한다.

---

## 5. 연결 상태 UI + 재연결 후 상태 복구

`useWebSocket`이 `connectionStatus: 'connected' | 'connecting'`을 반환한다. `ChatLayout`은 `connectionStatus === 'connecting'`일 때만 상단에 작은 배너("연결이 끊겼습니다. 재연결 중...")를 표시한다. 채팅 화면 자체는 그대로 두고 눈에 띄지 않게 알리기만 한다(사용자가 명시적으로 선택한 방식).

재연결 성공(`onopen`) 시, **재연결인 경우에만**(최초 연결이 아님 — `retryCountRef.current > 0`으로 판별) 현재 활성 방의 메시지를 REST로 다시 조회한다(`fetchMessages(activeRoomId)`). 서버가 끊긴 동안의 이벤트를 재전송해주지 않으므로, 클라이언트가 능동적으로 최신 상태를 다시 받아오는 방식을 택했다. presence/안읽음 카운트 등 다른 상태는 이번 스펙 범위에서는 다루지 않는다(메시지만 복구).

---

## 6. 컴포넌트별 변경 사항

### `frontend/src/types/index.ts`
- `WSPong { type: 'pong' }` 추가, `WSPayload` 유니온에 포함

### `frontend/src/hooks/useWebSocket.ts`
- `retryCountRef`, `reconnectTimeoutRef`, `pingIntervalRef`, `pongTimeoutRef` 추가
- 연결 로직을 재귀 호출 가능한 함수로 추출 (`connect()` — `onclose`/heartbeat 타임아웃 양쪽에서 재사용)
- `onclose` → 백오프 지연 계산 후 `setTimeout`으로 `connect()` 재호출 예약
- `onopen` → `retryCountRef.current`가 0보다 크면(재연결) `fetchMessages(activeRoomId)` 호출 후 0으로 리셋; `connectionStatus`를 `'connected'`로 설정
- ping 주기를 2분 → 30초로 변경, ping 전송 시마다 10초 워치독 타이머 설정, `pong` 수신 시 취소
- `connectionStatus` state 추가 및 반환값에 포함
- 언마운트/`token` 변경 시 `reconnectTimeoutRef`, `pingIntervalRef`, `pongTimeoutRef` 전부 정리

### `frontend/src/components/Chat/ChatLayout.tsx`
- `useWebSocket`에서 `connectionStatus` 구조분해
- `connectionStatus === 'connecting'`일 때 상단 배너 렌더링

---

## 7. 테스트 방법

자동화 테스트 없이 브라우저에서 수동 확인한다.
1. 개발자도구 Network 탭에서 WS 연결을 강제로 끊거나(`docker compose restart backend`) 백엔드 컨테이너 재시작 → 배너 노출 → 자동 재연결 → 배너 사라짐 확인
2. 재연결 후 메시지 목록이 최신 상태로 갱신되는지 확인 (끊긴 동안 다른 브라우저/시크릿창에서 메시지를 보내본 뒤 확인)
3. 콘솔에서 백오프 지연시간이 1s→2s→4s...로 증가하는지 로그로 확인

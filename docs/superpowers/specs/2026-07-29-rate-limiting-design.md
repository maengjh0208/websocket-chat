# Rate Limiting (slowapi) — 설계 문서

**작성일:** 2026-07-29
**상태:** 승인됨

---

## 1. 배경 및 목표

`docs/superpowers/plans/2026-07-28-ws-connection-hardening.md`까지 완료한 뒤 다음 순서로 예정되어 있던 두 번째 작업이다 (재연결 → **Rate limiting** → Locust 부하 테스트).

**목표:**
1. **개념 학습** — rate limiting이 왜 필요한 개념인지, slowapi가 실제로 어떻게 동작하는지(내부적으로 `limits` 라이브러리를 감싼 것) 이해한다.
2. **서버 안정성/비용 보호** — 특정 유저나 스크립트의 과도한 요청으로 DB/Redis/서버 리소스가 소진되는 것을 막는다. 스팸/악용 방지는 목적이 아니라 부수적 효과다.

**전제 조건 (기존 아키텍처):** 이 프로젝트는 Nginx + Redis Pub/Sub으로 **다중 backend 인스턴스**를 지원하도록 이미 설계되어 있다. 따라서 rate limit 카운터를 프로세스 in-memory에 두면, 유저가 서로 다른 backend 인스턴스로 라우팅될 때마다 카운터가 따로 놀아서 실제 허용치가 서버 대수만큼 늘어나버린다. 반드시 프로세스 밖(Redis)에 카운터를 둬야 한다.

**범위 밖:** Locust 부하 테스트는 이 작업이 끝난 뒤 별도 스펙으로 진행한다(`CLAUDE.md` 진행 상황 참고).

---

## 2. 전체 아키텍처

```
                    ┌─────────────────────────┐
                    │   Redis (이미 존재)       │
                    │  - Pub/Sub (기존)         │
                    │  - Rate limit 카운터 (신규) │
                    └─────────────────────────┘
                       ▲                    ▲
                       │                    │
         ┌─────────────┴───────┐   ┌───────┴──────────────┐
         │ slowapi Limiter     │   │ 같은 Limiter 인스턴스   │
         │ (REST, 데코레이터)    │   │ (WS, 수동 호출)         │
         └─────────────┬───────┘   └───────┬──────────────┘
                        │                   │
              REST 엔드포인트          /ws message.send
         (auth, users, rooms, ...)   (websocket.py 루프 안)
```

`app/core/limiter.py`(신규)에 `Limiter` 인스턴스를 **하나만** 생성하고 `storage_uri=settings.REDIS_URL`로 Redis에 연결한다. REST 라우터는 이 인스턴스를 `@limiter.limit(...)` 데코레이터로 사용하고, `websocket.py`의 `message.send` 분기는 같은 인스턴스를 수동으로 호출해서 카운트를 확인한다. 카운터 저장소를 공유하므로 REST/WS 어느 쪽으로 요청이 오든, backend 인스턴스가 몇 대든 정확하게 합산된다.

slowapi는 FastAPI/Starlette용으로 [`limits`](https://limits.readthedocs.io/) 라이브러리를 감싼 얇은 래퍼다. 구현 단계에서 slowapi 공식 문서를 참고해 정확한 API(특히 WebSocket 컨텍스트에서 수동으로 limit을 확인하는 방법)를 확인한다.

---

## 3. REST — 식별 기준과 제한 수치

### key_func (식별 기준)

Authorization 헤더에 유효한 JWT가 있으면 **user_id**, 없거나 유효하지 않으면 **클라이언트 IP**를 키로 사용하는 커스텀 key_func을 만든다. `/auth/login`, `/auth/register`처럼 토큰이 아예 없는 요청은 자연스럽게 IP로 처리되고, 인증된 요청은 더 정밀하게 유저 단위로 제한된다.

### 제한 수치

| 대상 | 제한 | 비고 |
|---|---|---|
| 전체 REST 엔드포인트 (기본값) | **60/minute** | slowapi의 `default_limits`로 앱 전체에 일괄 적용. 일반 사용 패턴에서는 걸리지 않는 넉넉한 상한 |
| `POST /auth/login` | **10/minute** (IP 기준) | 무차별 대입 공격 방어 |
| `POST /auth/register` | **10/minute** (IP 기준) | 대량 계정 생성 방지 |

숫자는 설정값으로 분리해서, 실제 운영해보며 코드 수정 없이 튜닝 가능하게 한다.

---

## 4. WebSocket — `message.send` 제한

REST 기본값(분당 단위)과 달리, 채팅은 "짧게 몰아 보내고 쉬는" 패턴이 자연스러우므로 더 짧은 윈도우를 쓴다.

- **10초당 10회** (user_id 기준) — 초당 1개꼴. 실제 타이핑 속도로는 절대 안 걸리고, 스크립트 연타만 걸린다.

### 초과 시 동작

연결을 끊지 않는다. 이미 만들어둔 재연결/heartbeat 로직과 충돌할 여지를 없애기 위해, limit에 걸린 `message.send`는 DB에 저장하지 않고(= 다른 유저에게 브로드캐스트되지 않고) 무시하며, 보낸 사람에게만 에러를 응답한다.

```json
{"type": "error", "error_code": "RATE_LIMIT_EXCEEDED", "detail": "메시지를 너무 빠르게 보내고 있어요"}
```

`pubsub.publish`를 거치지 않고 `manager.send_to_user(user.id, {...})`로 본인에게만 직접 전송한다.

---

## 5. 에러 응답 형식

### REST

기존 에러 컨벤션(`app/core/exceptions.py`의 `AppError` + `ErrorCode`, `app/core/error_handlers.py`의 `register_exception_handlers`)을 그대로 따른다.

- `ErrorCode`에 `RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"` (429) 추가
- slowapi가 던지는 `RateLimitExceeded` 예외를 잡는 핸들러를 `register_exception_handlers`에 추가로 등록해서, 기존 `{"error_code", "detail", "status_code"}` 응답 형태와 동일하게 맞춘다

이렇게 하면 프론트는 지금 400/401/403/404를 처리하는 것과 동일한 방식으로 429도 처리할 수 있어, 별도 분기가 필요 없다.

### WebSocket

`app/core/enums.py`의 `WSMessageType`에 `ERROR = "error"`를 추가한다. 페이로드 형태는 §4 참고.

---

## 6. 프론트엔드 — WS rate limit 에러 UX

`useWebSocket.ts`의 `onmessage`에 `payload.type === 'error'` 분기를 추가한다. 재연결 배너(`connectionStatus`)와 유사한 패턴으로, 작은 토스트/배너를 짧게 띄워 `detail` 메시지를 보여준다("메시지를 너무 빠르게 보내고 있어요" 등). REST 429는 이미 존재하는 API 에러 처리 경로(있다면 axios 인터셉터 등)를 그대로 타므로 별도 작업이 필요 없는지 구현 단계에서 확인한다.

---

## 7. 변경 대상 파일

**백엔드** (Claude는 코드를 직접 작성하지 않고 계획 문서에 단계별 가이드로 남긴다 — `CLAUDE.md` 규칙):
- `backend/requirements.txt` — `slowapi` 추가
- `backend/app/core/limiter.py` (신규) — `Limiter` 인스턴스, key_func
- `backend/app/core/exceptions.py` — `RATE_LIMIT_EXCEEDED` 에러코드 추가
- `backend/app/core/error_handlers.py` — `RateLimitExceeded` 예외 핸들러 등록
- `backend/app/core/enums.py` — `WSMessageType.ERROR` 추가
- `backend/app/main.py` — `app.state.limiter` 설정, `default_limits` 적용
- `backend/app/api/routes/auth.py` — `login`/`register`에 `@limiter.limit("10/minute")`
- `backend/app/api/websocket.py` — `message.send` 분기에 수동 limit 체크 추가

**프론트엔드** (Claude가 직접 작성, WS 관련 부분은 설명 포함):
- `frontend/src/types/index.ts` — `WSError` 타입 추가
- `frontend/src/hooks/useWebSocket.ts` — `error` 타입 처리
- 토스트/배너 UI (기존 재연결 배너 패턴 재사용 — 구현 단계에서 정확한 위치 결정)

---

## 8. 테스트 계획

- **REST**: `pytest`로 `/auth/login`에 분당 10회 초과 요청 시 11번째부터 429 + `RATE_LIMIT_EXCEEDED` 확인. `/auth/register`도 동일. 일반 엔드포인트는 60회 초과 시 429 확인.
- **WS**: Docker 컨테이너 안에서 `websockets` 라이브러리 진단 스크립트로 `message.send`를 10초 안에 11번 연속 전송 → 11번째부터 `type: error` 응답, DB에는 10개만 저장됐는지 확인.
- **멀티 서버 시나리오 (핵심)**: `docker compose up --scale backend=2`로 백엔드 2대를 띄우고, nginx가 라운드로빈으로 분산하는 상태에서 같은 유저가 총 15회 요청 시(서버별로는 각각 7~8개씩 받더라도) 합쳐서 10회 초과 시점에 걸리는지 확인. 이게 Redis storage가 실제로 필요한 이유를 증명하는 테스트.
- **수동 브라우저 테스트**: 로그인 화면에서 짧은 시간에 여러 번 로그인 시도, 채팅창에서 메시지 연타 전송 후 배너 노출 확인.

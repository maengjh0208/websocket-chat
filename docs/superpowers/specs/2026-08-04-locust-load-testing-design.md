# Locust 부하 테스트 — 설계 문서

**작성일:** 2026-08-04
**상태:** 승인됨

---

## 1. 배경 및 목표

`docs/superpowers/plans/2026-07-29-rate-limiting.md`까지 완료한 뒤 마지막으로 예정되어 있던 세 번째 작업이다 (재연결 → Rate limiting → **Locust 부하 테스트**).

**목표:**
1. **개념 학습** — 부하 테스트가 왜 필요한 개념인지, Locust가 기존 도구(Apache Bench, JMeter)와 어떻게 다른지, gevent 기반 가상 사용자가 어떻게 동작하는지 이해한다.
2. **현재 인프라의 한계치 파악** — 동시접속자 수를 점점 늘려가며, 지금 구성(Docker Compose, nginx, backend, Redis, DB)이 어느 지점부터 응답시간이 나빠지고 에러가 나기 시작하는지 실측한다. Rate limiting이 제 역할을 하는지 검증하는 건 목적이 아니다 (그건 이미 별도 스펙에서 끝난 작업).
3. **수평 확장 효과 확인** — backend 인스턴스를 1대/2대/3대로 늘렸을 때 처리 가능한 동시접속자 수가 실제로 늘어나는지 비교한다. `nginx.conf`의 동적 DNS 재해석 수정과 Redis 기반 멀티서버 rate limiting이 실제로 의미가 있었는지 이번에 처음으로 수치로 확인하게 된다.

**전제 조건 (기존 아키텍처):**
- Nginx가 `resolver` + 변수 기반 `proxy_pass`로 backend 컨테이너를 동적으로 찾아 라운드로빈한다 (2026-08-03 수정 완료).
- Rate limiting은 Redis에 카운터를 두므로 여러 backend 인스턴스에 걸쳐도 정확히 합산된다.
- WebSocket 연결은 유저 1명당 여러 개를 동시에 들고 있을 수 있다 (`ConnectionManager.connections: dict[UUID, set[WebSocket]]`).

**범위 밖:** 실시간 웹 UI로 진행 상황을 관찰하는 방식은 이번 스펙에서 결정하지 않고, 구현 이후 별도로 다시 논의한다. 이번 스펙은 `--headless` + CSV 출력을 기본 실행 방식으로 한다.

---

## 2. 전체 아키텍처

```
loadtest/                          (신규, 최상위 디렉터리 — backend/frontend와 동급)
├── seed_users.py                  # 테스트 계정을 /auth/register로 미리 생성
├── users.json                     # seed_users.py가 만든 (username, password) 목록
├── locustfile.py                  # ChatRestUser + ChatWebSocketUser
├── shapes.py                      # 단계별 부하 증가를 자동화하는 LoadTestShape
├── results/                       # --csv 출력 (인스턴스 수별로 파일 분리)
└── README.md                      # 실행 절차, 인스턴스 1/2/3대 비교 방법, 기준선 수치

backend/app/core/
├── config.py                      # DEFAULT_RATE_LIMIT, AUTH_RATE_LIMIT 환경변수 추가
├── limiter.py                     # 하드코딩된 "60/minute" → settings 참조로 변경
└── api/routes/auth.py             # 하드코딩된 "10/minute" → settings 참조로 변경
```

`loadtest/`를 `backend/` 밖 최상위에 두는 이유: Locust는 우리 백엔드 앱의 일부가 아니라 **외부에서 서버를 두드리는 별도 도구**다. `frontend/`, `backend/`와 동급의 독립된 최상위 디렉터리로 둬서, 도커 이미지 빌드나 앱 코드에 섞여 들어가지 않게 한다.

---

## 3. 테스트 대상 환경 / 실행 절차

로컬 Docker Compose 환경(`make up` / `make up-backend-2` / `make up-backend-3`)을 대상으로 한다. Render 배포 환경은 실제 서비스에 부하를 주는 위험이 있어 이번 스펙에서는 다루지 않는다.

```
1. make up (또는 up-backend-2 / up-backend-3)로 대상 토폴로지 기동
2. python loadtest/seed_users.py  → loadtest/users.json 생성 (최초 1회, 재실행 안전)
3. 스모크 테스트: 가상 사용자 2~3명으로 짧게 돌려서 시나리오가 끝까지 에러 없이 도는지 확인
4. locust -f loadtest/locustfile.py --host http://localhost:8000 \
       --headless --csv=loadtest/results/1-instance
   (shapes.py의 LoadTestShape가 10 → 50 → 100 → 200명 단계를 자동 진행)
5. 종료 후 loadtest/results/1-instance_stats_history.csv 에 시간대별 응답시간/에러율 기록됨
6. 인스턴스 수를 바꿔가며 2, 3 반복 → results/2-instance_*, results/3-instance_*
7. 세 CSV를 비교해서 "인스턴스 수 대비 처리 가능한 동시접속자 수"를 확인
```

- **스모크 테스트를 먼저 하는 이유**: 200명까지 단계적으로 올리는 전체 실행(수 분~수십 분 소요)을 시나리오 버그가 있는 채로 돌리면, 결과가 "서버 한계"가 아니라 "Locust 스크립트 버그"를 측정한 게 될 수 있다.
- **`--headless --csv=`를 쓰는 이유**: `shapes.py`가 이미 단계를 코드로 정의해뒀으므로, 사람이 웹 UI에서 매번 숫자를 바꿔 넣지 않아도 커맨드 한 줄로 전체 단계를 끝까지 돌리고 결과를 파일로 남길 수 있다.
- **매 실행 전 컨테이너를 완전히 새로 띄우는 걸 권장**한다. 이전 실행에서 쌓인 Redis rate-limit 카운터나 DB 커넥션 풀 상태가 다음 실행에 영향을 주지 않게 하기 위해서다 (`docker compose down` 후 재기동).

---

## 4. 시나리오 범위

핵심 플로우만 시뮬레이션한다 (친구/리액션/타이핑 인디케이터 등은 범위 밖):

```
1. POST /auth/login
2. GET /rooms
3. GET /rooms/dm
4. WS connect (/ws?token=...)
5. WS message.send 반복 (wait_time으로 간격)
6. 연결 유지 (heartbeat ping/pong, 30초 주기 — 실제 클라이언트와 동일)
```

---

## 5. WebSocket 부하 생성 방식

Locust의 기본 `HttpUser`는 REST(요청-응답 후 종료) 시나리오만 지원하고 WebSocket을 지원하지 않는다. WebSocket은 handshake로 연결을 맺은 뒤 계속 유지한 채로 메시지를 주고받는다는 점에서 근본적으로 다른 모양이라, 별도 구현이 필요하다.

**결정: `websocket-client` 라이브러리로 Locust `User`를 직접 상속받아 구현한다.**

- Locust 커뮤니티의 `locust-plugins` `WebSocketUser`를 쓰는 대안도 있었지만, 의존성이 하나 늘고 우리 서버의 커스텀 인증 방식(쿼리파라미터 JWT)·heartbeat 패턴에 얼마나 유연하게 맞출 수 있는지 불확실했다.
- 직접 구현하면 코드는 더 필요하지만, `useWebSocket.ts`가 실제로 하는 동작(handshake → heartbeat → 메시지 전송)과 가장 가깝게 재현할 수 있다.
- Locust 대시보드에 응답시간을 표시하려면 `environment.events.request.fire(...)`를 직접 호출해서 수동으로 통계를 기록해야 한다.

---

## 6. Rate limit 충돌 해결

`rate_limit_key`(`backend/app/core/limiter.py`)는 인증 전 요청(로그인/회원가입)을 **클라이언트 IP** 기준으로 분당 10회 제한한다. Locust를 로컬 한 대에서 돌리면 가상 사용자 전부가 같은 IP로 잡히므로, 동시 사용자를 10명만 넘겨도 로그인 자체가 막혀버려 "인프라 한계"가 아니라 "로그인 rate limit 한계"를 측정하게 된다.

**결정: 하드코딩된 rate limit 수치를 환경변수로 분리한다.**

```python
# backend/app/core/config.py
DEFAULT_RATE_LIMIT: str  # 기본값 "60/minute" — REST 전역
AUTH_RATE_LIMIT: str     # 기본값 "10/minute" — 로그인/회원가입
```

`.env.local`에만 완화된 값(예: `AUTH_RATE_LIMIT=1000/minute`)을 넣어서 부하테스트 때 쓰고, `.env.prod`는 기존 값 그대로 유지한다. 코드 변경 없이 로컬에서만 완화된 채로 돌릴 수 있고, 다음에 또 부하 테스트할 때도 그대로 재사용 가능하다.

WS `message.send`의 10초당 10회 제한은 `user_id` 기준이라 이 문제가 없다 (§7 참고, 여전히 유저별 버킷 분리가 필요한 이유).

---

## 7. 부하 매칭 전략 및 테스트 계정

**단계적 증가**: `loadtest/shapes.py`에서 `LoadTestShape`를 상속해 10 → 50 → 100 → 200명, 각 단계 2분 유지로 정의한다. 한 번의 실행으로 전체 단계를 훑고, 하나의 연속된 그래프에서 어느 시점부터 지표가 나빠지기 시작하는지 확인한다.

**계정 분리 — 최대 동시접속자 수(200)만큼 서로 다른 테스트 계정이 필요하다.** WebSocket 연결 자체는 유저당 여러 개를 동시에 지원하므로(§1 전제조건) 계정을 몇 개만 돌려써도 연결이 끊기는 문제는 없다. 하지만 REST/WS rate limit 키가 모두 `user_id` 기준이라, 계정 수가 적으면 여러 가상 사용자가 같은 rate limit 버킷을 나눠 쓰게 되어 실제 유저 수와 무관하게 훨씬 빨리 제한에 걸린다. 그러면 측정 대상이 "인프라의 실제 한계"가 아니라 "계정 하나짜리 rate limit 한계"로 왜곡된다. 그래서 `seed_users.py`는 목표 최대 동시접속자 수 이상(예: 200개)의 계정을 미리 만들어둔다.

---

## 8. 인스턴스 수 비교

`make up`(1대) / `make up-backend-2`(2대) / `make up-backend-3`(3대) 각각에 대해 동일한 시나리오·동일한 계정 세트로 실행하고, 결과 CSV를 비교한다. nginx의 동적 DNS 재해석 수정(2026-08-03)과 Redis 기반 멀티서버 rate limiting이 실제로 처리량을 늘려주는지 이번에 처음 수치로 확인한다.

---

## 9. 에러 처리 / 엣지 케이스

- **WS 연결 실패**: 실제 클라이언트는 지수 백오프로 무한 재시도하지만, 가상 사용자는 그렇게 하지 않는다. 재시도가 쌓이면 "서버가 못 버텨서 생긴 실패"인지 "Locust가 계속 재시도해서 생긴 노이즈"인지 구분이 안 되기 때문이다. `ChatWebSocketUser`는 연결 실패 시 1회만 시도하고 실패로 기록한 뒤 해당 사이클을 종료한다 (재연결 로직 검증은 범위 밖).
- **Locust 자체가 병목이 되는 상황 구분**: 로컬 노트북 한 대에서 Locust를 돌리면 서버보다 Locust 프로세스의 CPU/메모리가 먼저 한계에 달할 수 있다. 테스트 중 `docker stats`(backend)와 Locust 프로세스 리소스를 같이 관찰해서, RPS가 안 오르는데 에러율도 0에 가깝게 유지되면 서버가 아니라 클라이언트(Locust) 쪽이 막힌 신호로 해석한다. `loadtest/README.md`에 명시한다.
- **테스트 데이터가 로컬 개발 DB를 오염시키는 문제**: `loadtest_user_0001~0200` 계정과 이들이 주고받는 메시지가 평소 수동 테스트하던 로컬 `chat` DB에 그대로 쌓인다. **별도 DB로 격리하지 않고 그냥 개발 DB에 쌓이게 둔다** — 추가 인프라 없이 바로 실행 가능하다는 이점이 크고, 어차피 로컬 개발 데이터는 언제든 `docker compose down -v`로 초기화할 수 있다. 거슬리면 그때 리셋한다.

---

## 10. 변경/신규 대상 파일

**백엔드** (Claude는 코드를 직접 작성하지 않고 계획 문서에 단계별 가이드로 남긴다 — `CLAUDE.md` 규칙):
- `backend/app/core/config.py` — `DEFAULT_RATE_LIMIT`, `AUTH_RATE_LIMIT` 환경변수 추가
- `backend/app/core/limiter.py` — 하드코딩된 `"60/minute"` → `settings.DEFAULT_RATE_LIMIT`
- `backend/app/api/routes/auth.py` — 하드코딩된 `"10/minute"` → `settings.AUTH_RATE_LIMIT`
- `backend/.env.local` — `AUTH_RATE_LIMIT` 완화된 값 추가 (gitignore, 커밋 안 됨)

**부하테스트 도구** (백엔드에 준하는 성격으로 판단해 동일하게 가이드만 제공, 사용자가 직접 작성):
- `loadtest/seed_users.py` (신규)
- `loadtest/locustfile.py` (신규)
- `loadtest/shapes.py` (신규)
- `loadtest/README.md` (신규)

**Makefile**: `up-backend-2`, `up-backend-3` 타겟은 이미 작성 완료됨 (사용자가 직접 추가함).

---

## 11. 테스트 계획 / 산출물

- **최종 산출물**: `loadtest/results/`에 인스턴스 수(1/2/3)별 CSV. 결과 요약(어느 동시접속자 수부터 지표가 꺾이는지)은 실행 후 이 문서 또는 `loadtest/README.md`에 채워 넣는다.
- **관찰 기준**: 정확한 통과/실패 하드 기준보다, 단계가 올라가면서 그래프가 꺾이는 지점을 찾는 탐색적 측정이다. 참고용 기준선으로 REST p95 응답시간 1초, 에러율 1%를 README에 명시해서 "이 선을 넘는 순간부터가 한계 근처"라는 판단 근거로 삼는다.
- **스모크 테스트**: 본 실행 전 가상 사용자 2~3명으로 짧게 돌려 시나리오 자체의 정상 동작을 먼저 확인한다 (§3 참고).

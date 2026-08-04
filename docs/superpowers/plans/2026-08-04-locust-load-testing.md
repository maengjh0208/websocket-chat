# Locust 부하 테스트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **단, `CLAUDE.md` 프로젝트 규칙이 이 플랜의 실행 방식을 override한다: Task 1~5는 백엔드 코드/설정 파일 및 부하테스트 도구 스크립트라, 실행 주체(Claude)가 직접 `Write`/`Edit`으로 파일을 만들지 않는다. 각 Step의 코드 블록은 사용자에게 제시할 참고 자료이고, 실제 파일 작성은 사용자가 직접 한다. 사용자가 "다 했어"라고 알리면 diff를 읽어서 리뷰하고, 다음 Step으로 넘어간다. Task 6은 코드 작성이 없는 실행/검증 태스크라 이 제약과 무관하다.**

**Goal:** Locust로 로컬 Docker Compose 환경에 부하를 줘서, backend 인스턴스 1대/2대/3대일 때 각각 어느 동시접속자 수부터 응답시간·에러율이 나빠지는지 실측한다.

**Architecture:** `loadtest/`(최상위, 신규)에 계정 시딩 스크립트(`seed_users.py`), REST 로그인부터 WebSocket 연결·메시지 전송까지 한 흐름으로 수행하는 `ChatUser`(`locustfile.py`), 단계적 부하 증가를 자동화하는 `LoadTestShape`(`shapes.py`)를 둔다. WebSocket은 Locust가 기본 지원하지 않아 `websocket-client` + 수동 이벤트 기록으로 직접 구현한다. Rate limit 수치는 `backend/app/core/config.py`의 환경변수로 빼서, `.env.local`에서만 완화해 로그인 rate limit과의 충돌을 피한다.

**Tech Stack:** `locust`, `websocket-client`, `requests`(신규, `loadtest/requirements.txt`). 백엔드는 기존 FastAPI + pydantic-settings 그대로, 새 의존성 추가 없음(환경변수만 추가).

## Global Constraints

- **최대 동시접속자 수는 200명으로 고정한다** (`docs/superpowers/specs/2026-08-04-locust-load-testing-design.md` §7). `seed_users.py`, `shapes.py`가 이 숫자를 공유한다.
- **부하 단계**: 10 → 50 → 100 → 200명, 각 단계 2분 유지 (스펙 §7).
- **관찰 기준선**: REST p95 응답시간 1초, 에러율 1% (스펙 §11). 하드 pass/fail 게이트가 아니라 "이 근처부터 한계로 본다"는 참고선.
- **테스트 대상**: 로컬 Docker Compose만 (`make up` / `make up-backend-2` / `make up-backend-3`). Render 배포 환경은 범위 밖.
- **시나리오**: 로그인 → `GET /rooms` → `GET /rooms/dm` → WS 연결 → `message.send` 반복 → 30초 주기 heartbeat 유지 (스펙 §4). 친구/리액션/타이핑 등은 범위 밖.
- **테스트 데이터**: 로컬 개발 DB(`chat`)에 그대로 쌓이게 둔다. 별도 DB 격리 없음 (스펙 §9).
- **실시간 웹 UI 관찰 방식은 이번 플랜에서 다루지 않는다** — 기본은 `--headless --csv=`. 필요하면 같은 커맨드에서 `--headless`만 빼면 `:8089` 웹 UI가 뜨지만, 세부 방식은 추후 별도 논의.

---

### Task 1: 백엔드 — rate limit 수치를 환경변수로 분리

**Files:**
- Modify: `backend/app/core/config.py` (**사용자 직접 작성**)
- Modify: `backend/app/core/limiter.py` (**사용자 직접 작성**)
- Modify: `backend/app/api/routes/auth.py` (**사용자 직접 작성**)
- Test: `backend/tests/integration/test_rate_limit.py` (기존 파일, 수정 없음 — 회귀 확인용으로 그대로 재실행)

**Interfaces:**
- Consumes: 없음
- Produces: `settings.DEFAULT_RATE_LIMIT: str`, `settings.AUTH_RATE_LIMIT: str` — Task 2~6에서는 직접 쓰지 않지만, `.env.local`에 `AUTH_RATE_LIMIT`을 완화된 값으로 넣는 것이 Task 6(전체 실행)의 전제 조건

**배경**: `rate_limit_key`(`limiter.py`)는 로그인처럼 토큰이 없는 요청을 클라이언트 IP 기준으로 제한한다. Locust를 로컬 한 대에서 돌리면 가상 사용자 전부가 같은 IP로 잡혀서, 동시 사용자를 10명만 넘겨도 로그인 자체가 막힌다. 지금은 `"10/minute"`가 코드에 하드코딩돼 있어서 손대려면 코드를 고쳐야 하니, 환경변수로 빼서 `.env.local`에서만 완화할 수 있게 한다. 기본값은 지금과 동일하게 유지하므로(`60/minute`, `10/minute`), 이 태스크만으로는 운영 동작이 전혀 바뀌지 않는다.

- [ ] **Step 1: `backend/app/core/config.py`에 필드 추가**

`ACCESS_TOKEN_EXPIRE_DAYS: int` 바로 아래에 추가:
```python
    ACCESS_TOKEN_EXPIRE_DAYS: int
    # Rate limiting (기본값은 지금 하드코딩된 값과 동일. .env.local에서만 override해서
    # 부하테스트 때처럼 로컬에서 일시적으로 완화할 수 있게 함)
    DEFAULT_RATE_LIMIT: str = "60/minute"
    AUTH_RATE_LIMIT: str = "10/minute"
```

기본값을 pydantic 필드에 직접 박아뒀기 때문에, `.env.local`/`.env.prod`/CI(`deploy.yml`) 어디에도 이 두 값을 추가하지 않아도 지금과 동일하게 동작한다. 로컬에서 완화하고 싶을 때만 `.env.local`에 추가하면 된다.

- [ ] **Step 2: `backend/app/core/limiter.py`의 하드코딩된 `"60/minute"`을 설정값 참조로 변경**

현재:
```python
limiter = Limiter(
    key_func=rate_limit_key,  # 동기 함수여야 함
    default_limits=["60/minute"],
    storage_uri=settings.REDIS_URL,
)
```

변경:
```python
limiter = Limiter(
    key_func=rate_limit_key,  # 동기 함수여야 함
    default_limits=[settings.DEFAULT_RATE_LIMIT],
    storage_uri=settings.REDIS_URL,
)
```

- [ ] **Step 3: `backend/app/api/routes/auth.py`의 하드코딩된 `"10/minute"` 두 곳을 설정값 참조로 변경**

파일 상단 import에 추가:
```python
from app.core.config import settings
```

`register`, `login` 두 함수의 데코레이터를 각각 변경:
```python
@limiter.limit(settings.AUTH_RATE_LIMIT)
async def register(
```
```python
@limiter.limit(settings.AUTH_RATE_LIMIT)
async def login(
```

- [ ] **Step 4: 기존 rate limit 테스트가 그대로 통과하는지 확인 (회귀 없음을 증명)**

Run: `docker compose exec backend pytest tests/integration/test_rate_limit.py -v`
Expected: 5개 테스트(`test_default_rate_limit_applies_globally`, `test_register_rate_limit`, `test_login_rate_limit`, `test_default_rate_limit_is_isolated_per_user`, `test_message_send_limit_blocks_after_threshold`) 전부 `PASSED` — 기본값을 그대로 pydantic 필드 기본값으로 옮겼을 뿐이라 테스트 코드는 손대지 않아도 통과해야 함

- [ ] **Step 5: 전체 스위트 확인**

Run: `make backend-test`
Expected: 전부 `PASSED`

- [ ] **Step 6: 부하테스트 실행 직전에만 쓸 완화 값을 `.env.local`에 추가 (커밋 대상 아님)**

`backend/.env.local` 맨 아래에 추가:
```
AUTH_RATE_LIMIT=1000/minute
```

이 줄은 평소 개발할 때는 필요 없다. Task 6에서 실제로 부하테스트를 돌리기 직전에만 추가하고, 끝나면 지워도 되고 남겨둬도 로컬 전용이라 안전하다 (`.env.local`은 `.gitignore` 대상).

Run: `docker compose up -d backend`
Expected: `backend` 컨테이너가 재생성됨 (`env_file`은 컨테이너를 새로 만들어야 반영되므로)

- [ ] **Step 7: 커밋**

```bash
git add backend/app/core/config.py backend/app/core/limiter.py backend/app/api/routes/auth.py
git commit -m "feat: backend - rate limit 수치를 환경변수로 분리 (부하테스트용 로컬 완화 지원)"
```

(`.env.local`은 `.gitignore` 대상이라 커밋에 포함되지 않는다.)

---

### Task 2: 부하테스트 도구 — 테스트 계정 시딩 스크립트

**Files:**
- Create: `loadtest/requirements.txt` (**사용자 직접 작성**)
- Create: `loadtest/seed_users.py` (**사용자 직접 작성**)

**Interfaces:**
- Consumes: `POST /auth/register`, `POST /auth/login`, `GET /rooms`, `POST /rooms`, `GET /users`, `POST /rooms/{room_id}/members` (전부 기존 REST 엔드포인트, 신규 없음)
- Produces: `loadtest/users.json` — `{"room_id": str, "users": [{"username": str, "email": str, "password": str}, ...]}`. Task 3의 `locustfile.py`가 이 파일을 읽는다.

**배경**: 최대 동시접속자 수(200명)만큼 서로 다른 계정이 있어야 REST/WS rate limit 버킷이 겹치지 않는다 (스펙 §7). 또한 `message.send`는 발신자가 해당 방의 멤버가 아니면 서버가 조용히 무시하므로(`websocket.py:117` `is_room_member` 체크), 200개 계정이 전부 같은 방에 미리 초대돼 있어야 한다. 이 스크립트가 계정 생성 + 방 생성 + 전원 초대를 한 번에 처리한다.

- [ ] **Step 1: `loadtest/requirements.txt` 생성**

```
locust
websocket-client
requests
```

- [ ] **Step 2: `loadtest/seed_users.py` 생성**

```python
import json
from pathlib import Path

import requests

BASE_URL = "http://localhost:8000"
TOTAL_USERS = 200
PASSWORD = "LoadTest123!"
ROOM_NAME = "부하테스트방"
OUTPUT_FILE = Path(__file__).parent / "users.json"


def register(username: str, email: str) -> None:
    response = requests.post(
        f"{BASE_URL}/auth/register",
        json={"username": username, "email": email, "password": PASSWORD},
    )
    if response.status_code == 201:
        return
    # 이미 만들어둔 계정이면 재실행해도 에러 없이 건너뛴다 (재실행 안전성)
    if response.status_code == 400 and response.json().get("error_code") == "EMAIL_ALREADY_EXISTS":
        return
    response.raise_for_status()


def login(email: str) -> str:
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    response.raise_for_status()
    return response.json()["access_token"]


def get_or_create_room(token: str) -> str:
    headers = {"Authorization": f"Bearer {token}"}

    rooms = requests.get(f"{BASE_URL}/rooms", headers=headers)
    rooms.raise_for_status()
    for room in rooms.json():
        if room["name"] == ROOM_NAME:
            return room["id"]

    created = requests.post(f"{BASE_URL}/rooms", headers=headers, json={"name": ROOM_NAME})
    created.raise_for_status()
    return created.json()["id"]


def invite_all_loadtest_users(token: str, room_id: str) -> None:
    headers = {"Authorization": f"Bearer {token}"}

    users = requests.get(f"{BASE_URL}/users", headers=headers)
    users.raise_for_status()

    for user in users.json():
        if not user["username"].startswith("loadtest_user_"):
            continue
        # 이미 멤버인 유저를 다시 초대해도 room_service.invite_members가 조용히 무시하므로
        # 상태 코드를 따로 검사하지 않는다
        requests.post(
            f"{BASE_URL}/rooms/{room_id}/members",
            headers=headers,
            json={"user_id": user["id"]},
        )


def main() -> None:
    accounts = []
    for i in range(1, TOTAL_USERS + 1):
        username = f"loadtest_user_{i:04d}"
        email = f"loadtest_{i:04d}@test.local"
        register(username, email)
        accounts.append({"username": username, "email": email, "password": PASSWORD})
        print(f"[{i}/{TOTAL_USERS}] {username} 준비 완료")

    admin_token = login(accounts[0]["email"])
    room_id = get_or_create_room(admin_token)
    invite_all_loadtest_users(admin_token, room_id)

    OUTPUT_FILE.write_text(json.dumps({"room_id": room_id, "users": accounts}, indent=2, ensure_ascii=False))
    print(f"완료: {OUTPUT_FILE} 생성, room_id={room_id}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: 의존성 설치**

Run: `cd loadtest && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
Expected: `locust`, `websocket-client`, `requests` 설치 성공

- [ ] **Step 4: `make up`으로 대상 서버를 띄운 뒤 스크립트 실행**

Run: `docker compose --env-file backend/.env.local up -d` (백그라운드로 띄워서 같은 터미널에서 계속 작업)
Run: `cd loadtest && python seed_users.py`
Expected: `[1/200] loadtest_user_0001 준비 완료`부터 `[200/200] ...`까지 순서대로 출력되고, 마지막에 `완료: .../loadtest/users.json 생성, room_id=...` 출력

- [ ] **Step 5: 결과 확인**

Run: `python -c "import json; d = json.load(open('users.json')); print(len(d['users']), d['room_id'])"`
Expected: `200 <UUID 형식의 room_id>`

- [ ] **Step 6: 재실행 안전성(idempotency) 확인**

Run: `python seed_users.py` (다시 한번)
Expected: 에러 없이 완료. 계정이 중복 생성되지 않고(`EMAIL_ALREADY_EXISTS`로 스킵), 방도 새로 만들어지지 않고(이름으로 기존 방을 찾아 재사용) 동일한 `room_id`가 출력됨

- [ ] **Step 7: 커밋**

```bash
git add loadtest/requirements.txt loadtest/seed_users.py loadtest/.gitignore
git commit -m "feat: loadtest - 부하테스트용 계정 200개 + 공용 채팅방 시딩 스크립트"
```

`loadtest/.gitignore`에 아래 내용도 이 커밋에 포함시킨다 (테스트 계정 비밀번호가 담긴 `users.json`과 결과 CSV는 커밋 대상이 아님):
```
users.json
results/
venv/
```

---

### Task 3: 부하테스트 도구 — REST + WebSocket 통합 시나리오 (`ChatUser`)

**Files:**
- Create: `loadtest/locustfile.py` (**사용자 직접 작성**)

**Interfaces:**
- Consumes: `loadtest/users.json`(Task 2 산출물), `POST /auth/login`, `GET /rooms`, `GET /rooms/dm`, `/ws?token=` WebSocket 엔드포인트
- Produces: Locust `ChatUser` 클래스 — Task 4의 `shapes.py`가 이 클래스를 스폰 대상으로 씀 (같은 `locustfile.py` 안에 있으므로 별도 import 불필요)

**배경**: 스펙(§4)의 시나리오(로그인 → 방 목록 조회 → WS 연결 → 메시지 전송 반복 → heartbeat 유지)를 **한 명의 가상 사용자가 순서대로 전부 수행**하도록 구현한다. Locust 기본 `HttpUser`는 REST만 지원해서 WebSocket을 못 다루므로, `User`를 직접 상속받아 REST 호출과 WS 연결을 한 클래스 안에서 전부 수동으로 처리하고, 응답시간은 `events.request.fire(...)`로 직접 Locust 통계에 기록한다.

WS 연결은 유지되는 동안 서버가 브로드캐스트하는 프레임(다른 가상 사용자의 `message.new` 포함)을 계속 읽어서 버려야 한다. 안 그러면 소켓 수신 버퍼가 쌓이고, 서버 쪽 `websocket.send_json`이 막힐 수 있다. 이 수신 루프는 별도 gevent greenlet(`_receive_loop`)으로 돌리고, `ping`/`pong` 왕복 시간을 WS 연결의 헬스 지표로 기록한다 (메시지 브로드캐스트는 발신자-수신자 매칭이 안 돼서 정확한 응답시간 측정이 어렵기 때문에, `ping`/`pong`처럼 명확하게 짝이 맞는 왕복만 시간을 잰다).

- [ ] **Step 1: `loadtest/locustfile.py` 생성**

```python
import json
import random
import time
from pathlib import Path

import gevent
import requests
import websocket
from locust import User, task, between, events

USERS_FILE = Path(__file__).parent / "users.json"
HEARTBEAT_INTERVAL = 30  # frontend/src/hooks/useWebSocket.ts의 PING_INTERVAL_MS와 동일 주기


def load_accounts():
    data = json.loads(USERS_FILE.read_text())
    return data["room_id"], data["users"]


ROOM_ID, ACCOUNTS = load_accounts()
_account_iter = iter(ACCOUNTS)


def next_account():
    # 여러 ChatUser가 거의 동시에 on_start를 호출해도, gevent는 I/O를 기다릴 때만
    # 다른 greenlet으로 전환하고 순수 파이썬 연산(next() 자체)은 중간에 끊기지 않으므로
    # 별도 락 없이 안전하다.
    try:
        return next(_account_iter)
    except StopIteration:
        raise RuntimeError(
            f"등록된 테스트 계정({len(ACCOUNTS)}개)보다 가상 사용자 수가 많습니다. "
            "seed_users.py의 TOTAL_USERS를 늘려서 다시 시딩하세요."
        )


class ChatUser(User):
    wait_time = between(1, 3)

    def on_start(self):
        account = next_account()
        self.username = account["username"]
        self.ws = None
        self._running = False
        self._ping_sent_at = None

        start = time.time()
        response = requests.post(
            f"{self.host}/auth/login",
            json={"email": account["email"], "password": account["password"]},
        )
        self._fire("REST", "/auth/login", start, response.ok, response.status_code)
        response.raise_for_status()
        self.token = response.json()["access_token"]

        self._rest_get("/rooms")
        self._rest_get("/rooms/dm")

        self._connect_ws()
        if self.ws:
            self._running = True
            self.receiver_greenlet = gevent.spawn(self._receive_loop)
            self.heartbeat_greenlet = gevent.spawn(self._heartbeat_loop)

    def on_stop(self):
        self._running = False
        if self.ws:
            self.ws.close()

    def _rest_get(self, path: str):
        start = time.time()
        response = requests.get(f"{self.host}{path}", headers={"Authorization": f"Bearer {self.token}"})
        self._fire("REST", path, start, response.ok, response.status_code)

    def _fire(self, request_type: str, name: str, start: float, success: bool, status_code: int):
        events.request.fire(
            request_type=request_type,
            name=name,
            response_time=(time.time() - start) * 1000,
            response_length=0,
            exception=None if success else Exception(f"status={status_code}"),
        )

    def _connect_ws(self):
        ws_url = self.host.replace("http://", "ws://").replace("https://", "wss://")
        start = time.time()
        try:
            self.ws = websocket.create_connection(f"{ws_url}/ws?token={self.token}", timeout=10)
            self._fire("WS", "connect", start, True, 101)
        except Exception:
            self._fire("WS", "connect", start, False, 0)
            self.ws = None

    def _receive_loop(self):
        while self._running and self.ws:
            try:
                raw = self.ws.recv()
            except Exception:
                break

            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if payload.get("type") == "pong" and self._ping_sent_at is not None:
                self._fire("WS", "ping", self._ping_sent_at, True, 200)
                self._ping_sent_at = None
            elif payload.get("type") == "error":
                events.request.fire(
                    request_type="WS",
                    name="error",
                    response_time=0,
                    response_length=0,
                    exception=Exception(payload.get("detail", "unknown error")),
                )

    def _heartbeat_loop(self):
        while self._running and self.ws:
            gevent.sleep(HEARTBEAT_INTERVAL)
            if not self.ws:
                break
            self._ping_sent_at = time.time()
            try:
                self.ws.send(json.dumps({"type": "ping"}))
            except Exception:
                break

    @task
    def send_message(self):
        if not self.ws:
            return
        try:
            self.ws.send(json.dumps({
                "type": "message.send",
                "room_id": ROOM_ID,
                "content": f"부하테스트 메시지 {random.randint(1, 100000)}",
            }))
            events.request.fire(
                request_type="WS", name="message.send",
                response_time=0, response_length=0, exception=None,
            )
        except Exception as e:
            events.request.fire(
                request_type="WS", name="message.send",
                response_time=0, response_length=0, exception=e,
            )
```

- [ ] **Step 2: 스모크 테스트 (가상 사용자 3명, 30초)**

`make up`으로 서버가 떠 있는 상태에서:

Run: `cd loadtest && locust -f locustfile.py --host http://localhost:8000 --headless -u 3 -r 3 -t 30s`
Expected: 에러 로그(특히 `Traceback`) 없이 30초 후 정상 종료. 종료 시 출력되는 표에 `REST /auth/login`, `REST /rooms`, `REST /rooms/dm`, `WS connect`, `WS ping`, `WS message.send`가 전부 `# fails` 0으로 나타남

- [ ] **Step 3: DB에 실제로 메시지가 쌓였는지 확인**

Run: `docker compose exec db psql -U maengjh -d chat -c "SELECT count(*) FROM messages WHERE content LIKE '부하테스트 메시지%';"`
Expected: 0보다 큰 숫자 (스모크 테스트 30초 동안 보낸 메시지 수만큼)

- [ ] **Step 4: 커밋**

```bash
git add loadtest/locustfile.py
git commit -m "feat: loadtest - 로그인+REST+WebSocket 통합 시나리오(ChatUser) 구현"
```

---

### Task 4: 부하테스트 도구 — 단계적 부하 증가 (`LoadTestShape`)

**Files:**
- Create: `loadtest/shapes.py` (**사용자 직접 작성**)

**Interfaces:**
- Consumes: 없음 (Locust가 `locustfile.py`와 같은 디렉터리의 `*.py` 전체를 로드하므로, `ChatUser`를 명시적으로 import할 필요 없음 — Locust는 `LoadTestShape` 서브클래스와 `User` 서브클래스를 자동으로 찾음)
- Produces: `StepLoadShape` — Task 6의 실행 커맨드가 `-f locustfile.py,shapes.py`로 두 파일을 함께 로드해서 사용

**배경**: 10 → 50 → 100 → 200명, 각 단계 2분(Global Constraints 참고)을 코드로 정의해서, 매번 웹 UI에서 수동으로 숫자를 바꿔 넣지 않고 한 번의 실행으로 전체 단계를 자동으로 훑는다.

- [ ] **Step 1: `loadtest/shapes.py` 생성**

```python
from locust import LoadTestShape


class StepLoadShape(LoadTestShape):
    # duration은 테스트 시작(0초)부터 이 단계가 끝나는 시점까지의 누적 시간(초).
    # 즉 10명 단계는 0~120초, 50명 단계는 120~240초, ... 200명 단계는 360~480초.
    stages = [
        {"users": 10, "duration": 120, "spawn_rate": 5},
        {"users": 50, "duration": 240, "spawn_rate": 5},
        {"users": 100, "duration": 360, "spawn_rate": 5},
        {"users": 200, "duration": 480, "spawn_rate": 5},
    ]

    def tick(self):
        run_time = self.get_run_time()

        for stage in self.stages:
            if run_time < stage["duration"]:
                return stage["users"], stage["spawn_rate"]

        return None  # 모든 단계 종료 → 테스트 자동 종료
```

- [ ] **Step 2: 짧은 축소판으로 단계 전환이 실제로 동작하는지 확인**

`stages`를 임시로 아래처럼 바꿔서 빠르게 확인(확인 후 원래 값으로 되돌릴 것):
```python
    stages = [
        {"users": 3, "duration": 15, "spawn_rate": 3},
        {"users": 6, "duration": 30, "spawn_rate": 3},
    ]
```

Run: `locust -f locustfile.py,shapes.py --host http://localhost:8000 --headless`
Expected: Locust 로그에 사용자 수가 3명으로 스폰됐다가 15초 시점에 6명으로 늘어나는 로그(`Shape test updating to 3 users`, 이어서 `Shape test updating to 6 users`)가 보이고, 30초 시점에 테스트가 자동 종료됨

확인 후 `stages`를 Step 1의 원래 값(10/50/100/200, 120/240/360/480)으로 되돌린다.

- [ ] **Step 3: 커밋**

```bash
git add loadtest/shapes.py
git commit -m "feat: loadtest - 10/50/100/200명 단계적 부하 증가 LoadTestShape 추가"
```

---

### Task 5: 부하테스트 도구 — 실행 절차 문서화

**Files:**
- Create: `loadtest/README.md` (**사용자 직접 작성**)

**Interfaces:**
- Consumes: Task 1~4의 모든 산출물
- Produces: 없음 (문서)

- [ ] **Step 1: `loadtest/README.md` 생성**

```markdown
# 부하 테스트 (Locust)

## 목적

로컬 Docker Compose 환경에서 동시접속자 수를 10 → 50 → 100 → 200명으로 단계적으로 늘려가며,
REST 응답시간과 WebSocket 연결/메시지 전송 실패율이 어느 시점부터 나빠지는지 확인한다.
backend 인스턴스 1대/2대/3대를 각각 비교해서 수평 확장이 실제로 처리량을 늘려주는지도 함께 본다.

참고용 기준선: REST p95 응답시간 1초, 에러율 1%. 이 선을 넘기 시작하는 지점을 "한계 근처"로 본다
(정확한 pass/fail 게이트가 아니라 탐색적 측정).

## 사전 준비 (최초 1회)

```bash
cd loadtest
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

`backend/.env.local`에 아래 줄이 없다면 추가하고 backend를 재기동한다 (로그인 rate limit이
로컬 IP 기준이라, 여러 가상 사용자가 동시에 로그인하면 즉시 막히기 때문 — Task 1 참고):
```
AUTH_RATE_LIMIT=1000/minute
```
```bash
docker compose up -d backend
```

## 실행 절차

```bash
# 1. 대상 토폴로지 기동 (아래 셋 중 하나)
make up             # backend 1대
make up-backend-2   # backend 2대
make up-backend-3   # backend 3대

# 2. 테스트 계정 200개 + 공용 채팅방 시딩 (최초 1회, 재실행해도 안전)
cd loadtest && source venv/bin/activate
python seed_users.py

# 3. 스모크 테스트 — 시나리오 자체가 정상 동작하는지 짧게 확인
locust -f locustfile.py --host http://localhost:8000 --headless -u 3 -r 3 -t 30s
# "# fails" 열이 전부 0인지 확인. 하나라도 실패가 있으면 본 실행 전에 원인을 먼저 해결한다.

# 4. 본 실행 (10 → 50 → 100 → 200명, 8분 소요)
locust -f locustfile.py,shapes.py --host http://localhost:8000 \
    --headless --csv=results/1-instance
# up-backend-2로 띄웠다면 --csv=results/2-instance, up-backend-3이면 --csv=results/3-instance

# 5. 컨테이너 정리 후 다음 토폴로지로 반복
docker compose down
```

## 결과 확인

- `results/<N>-instance_stats_history.csv`: 시간대별 RPS, 응답시간, 실패 건수
- `results/<N>-instance_stats.csv`: 엔드포인트별(REST 경로, `WS connect`, `WS ping`, `WS message.send`) 요약 통계
- 세 CSV의 `Total Failure Count`, `95%`(응답시간) 열을 동시접속자 단계별로 비교해서,
  인스턴스 수가 늘수록 같은 동시접속자 수에서 실패율/응답시간이 낮아지는지 확인한다.

## 관찰 시 주의할 점

- **Locust 자체가 병목일 수 있다**: 로컬 노트북 한 대에서 Locust를 돌리면 서버보다 Locust
  프로세스의 CPU가 먼저 한계에 달할 수 있다. 실행 중 `docker stats`(backend 컨테이너)와
  `top`(locust 프로세스)을 같이 관찰해서, RPS가 안 오르는데 에러율도 0에 가깝게 유지된다면
  서버가 아니라 Locust 쪽이 막힌 신호로 해석한다.
- **테스트 데이터가 로컬 개발 DB에 쌓인다**: `loadtest_user_0001~0200` 계정과 이들이 보낸
  메시지가 평소 수동 테스트하던 `chat` DB에 그대로 남는다. 거슬리면
  `docker compose down -v`로 초기화한다 (다른 로컬 개발 데이터도 함께 사라지니 주의).
- **실시간으로 진행 상황을 보고 싶으면** `--headless`를 빼고 실행하면 `http://localhost:8089`에
  웹 UI가 뜬다. 이 경우 `shapes.py`가 자동으로 단계를 진행하므로, 웹 UI에서 별도로 시작 버튼을
  누를 필요 없이 접속만 하면 진행 상황이 보인다.
```

- [ ] **Step 2: 커밋**

```bash
git add loadtest/README.md
git commit -m "docs: loadtest - 실행 절차 및 인스턴스 수 비교 방법 문서화"
```

---

### Task 6: 전체 실행 — 1/2/3 인스턴스 비교

**Files:** 없음 (실행 + 결과 기록 전용, 코드 변경 없음)

- [ ] **Step 1: backend 1대로 본 실행**

```bash
make up
cd loadtest && source venv/bin/activate
python seed_users.py   # 이미 했다면 스킵 가능 (idempotent)
locust -f locustfile.py --host http://localhost:8000 --headless -u 3 -r 3 -t 30s  # 스모크 테스트
locust -f locustfile.py,shapes.py --host http://localhost:8000 --headless --csv=results/1-instance
docker compose down
```

Expected: `results/1-instance_stats_history.csv`, `results/1-instance_stats.csv` 생성됨

- [ ] **Step 2: backend 2대로 본 실행**

```bash
make up-backend-2
locust -f locustfile.py,shapes.py --host http://localhost:8000 --headless --csv=results/2-instance
docker compose down
```

Expected: `results/2-instance_*` 생성됨

- [ ] **Step 3: backend 3대로 본 실행**

```bash
make up-backend-3
locust -f locustfile.py,shapes.py --host http://localhost:8000 --headless --csv=results/3-instance
docker compose down
```

Expected: `results/3-instance_*` 생성됨

- [ ] **Step 4: 세 결과 비교**

`results/1-instance_stats.csv`, `2-instance_stats.csv`, `3-instance_stats.csv`를 열어서 `Total Failure Count`와 `95%` 응답시간 열을 비교한다. 인스턴스 수가 늘수록 같은 부하(특히 100/200명 단계)에서 실패율이 낮아지거나 응답시간이 짧아지는지 확인한다.

- [ ] **Step 5: 발견한 내용을 `CLAUDE.md`에 기록**

`CLAUDE.md`의 "성능/안정성 보강" 섹션, `Locust 부하 테스트` 항목을 `[x]`로 바꾸고, 3개 CSV에서 확인한 핵심 수치(예: "1대는 100명부터 실패율 급증, 3대는 200명까지 안정적" 등 실제 관찰된 내용)를 요약해서 추가한다. 이 스텝은 실행 결과에 따라 내용이 달라지므로, 실제 수치를 보고 나서 작성한다.

- [ ] **Step 6: 이 태스크는 검증 전용이라 코드 커밋 없음**

`CLAUDE.md` 갱신만 별도로 커밋 (사용자가 원하는 시점에):
```bash
git add CLAUDE.md
git commit -m "docs: Locust 부하 테스트 결과 기록"
```

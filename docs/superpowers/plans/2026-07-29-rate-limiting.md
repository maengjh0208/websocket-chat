# Rate Limiting(slowapi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** REST 엔드포인트와 WebSocket `message.send`에 Redis 기반 rate limiting을 적용해서, 멀티 서버 환경에서도 정확하게 동작하는 서버 안정성 보호 장치를 만든다.

**Architecture:** `app/core/limiter.py`에 slowapi `Limiter`(REST용, `storage_uri=REDIS_URL`)와 `limits` 라이브러리를 직접 쓰는 WS용 카운터를 함께 둔다. REST는 `SlowAPIMiddleware` + 전역 `default_limits`로 전체 엔드포인트에 기본값을 적용하고, `/auth/login`·`/auth/register`는 `@limiter.limit(...)` 데코레이터로 더 엄격한 값을 override한다. WebSocket은 slowapi가 공식적으로 WS를 지원하지 않으므로(README에 명시됨), `message.send` 분기에서 `limits` 라이브러리의 `FixedWindowRateLimiter.hit()`을 직접 호출한다.

**Tech Stack:** 백엔드는 FastAPI + `slowapi`(신규 의존성, 정확한 버전은 Task 2에서 설치 후 확정) + `limits`(slowapi의 의존성, 이미 같이 설치됨) + 기존 Redis. 프론트는 기존과 동일(React, TypeScript).

## Global Constraints

- **Task 1~4(백엔드)는 Claude가 코드를 직접 작성하지 않는다** (`CLAUDE.md` 규칙). 이 플랜을 실행하는 주체는 각 태스크의 코드 블록을 참고 자료로만 사용자에게 제시하고, 실제 파일 수정은 사용자가 직접 하도록 안내한 뒤, 사용자가 완료했다고 알려주면 그 결과를 리뷰한다.
- **Task 5(프론트)는 Claude가 직접 작성한다.** WebSocket과 연결되는 부분(`useWebSocket.ts`)은 반드시 설명을 포함한다 (`CLAUDE.md` 규칙).
- **slowapi는 WebSocket을 지원하지 않는다** — 공식 README에 "`websocket` endpoints are not supported yet"라고 명시되어 있다. 따라서 WS 쪽은 slowapi의 `Limiter`가 아니라, slowapi가 내부적으로 쓰는 `limits` 라이브러리를 직접 사용한다. REST와 WS는 서로 다른 Python 객체를 쓰지만, 둘 다 같은 `settings.REDIS_URL`을 가리키므로 멀티 서버 환경에서 정확하게 합산된다는 설계 목표는 동일하게 달성된다.
- **제한 수치**: 전역 기본값 `60/minute`, `/auth/login`·`/auth/register` `10/minute`, WS `message.send` `10/10 seconds`. 모두 스펙(`docs/superpowers/specs/2026-07-29-rate-limiting-design.md`)에서 확정된 값.
- **초과 시 동작**: REST는 429 + `{"error_code": "RATE_LIMIT_EXCEEDED", "detail": ..., "status_code": 429}` (기존 `AppError` 응답 포맷과 동일). WS `message.send`는 연결을 끊지 않고, 해당 메시지만 무시한 뒤 보낸 사람에게만 `{"type": "error", "error_code": "RATE_LIMIT_EXCEEDED", "detail": ...}`를 전송한다.
- **로컬 테스트 실행 방식이 이번 플랜에서 호스트 → 도커 컨테이너 내부로 바뀐다** (Task 1). slowapi의 Redis storage는 생성 시점에 URI로 연결을 맺는 구조라 `app/core/redis.py`의 `redis_client`처럼 깔끔하게 monkeypatch할 수 없기 때문. 이 변경은 GitHub Actions CI에는 영향 없음 (CI는 `docker compose`/`Makefile`을 쓰지 않고 러너에서 직접 `pytest`를 실행하며, `REDIS_URL`도 이미 `localhost`로 맞춰져 있음).

---

### Task 1: 백엔드 — 로컬 테스트 실행을 도커 컨테이너 내부로 전환

**Files:**
- Modify: `Makefile` (`backend-test` 타겟, **사용자 직접 작성**)
- Modify: `backend/.env.local` (`TEST_DATABASE_URL`, `TEST_REDIS_URL`, **사용자 직접 작성** — 이 파일은 `.gitignore`에 포함되어 있어 커밋 대상이 아님)
- Modify: `backend/tests/conftest.py` (`override_redis` fixture, **사용자 직접 작성**)

**Interfaces:**
- Consumes: 없음
- Produces: 이후 모든 태스크의 `docker compose exec backend pytest . -v` 검증 명령이 이 태스크에 의존함

**배경**: 지금 `make backend-test`는 `cd backend && pytest . -v`로 **호스트에서 직접** 실행된다. `backend/.env.local`의 `REDIS_URL=redis://redis:6379`(도커 네트워크 전용 호스트명)는 호스트에서 해석되지 않아서, 기존에는 `TEST_REDIS_URL=redis://localhost:6379`를 만들고 `conftest.py`의 `override_redis` fixture가 `redis_client`를 이걸로 바꿔치기하는 방식으로 우회했다. 그런데 이번에 추가할 slowapi의 `Limiter`는 `storage_uri`로 생성 시점에 Redis 연결을 맺어버리고, 이후에 바꾸려면 `limiter._storage`/`limiter._limiter` 같은 비공식 내부 속성을 건드려야 해서 버전이 바뀌면 깨질 위험이 있다. 그래서 애초에 테스트를 도커 컨테이너 안(도커 네트워크 안이라 `redis`, `db` 호스트명이 정상 해석됨)에서 돌리는 쪽으로 바꾼다.

- [ ] **Step 1: `backend/.env.local`의 테스트용 URL을 도커 네트워크 호스트명으로 변경**

현재:
```
TEST_DATABASE_URL=postgresql+asyncpg://maengjh:Aa123456!@localhost:5432/test_chat
TEST_REDIS_URL=redis://localhost:6379
```

변경:
```
TEST_DATABASE_URL=postgresql+asyncpg://maengjh:Aa123456!@db:5432/test_chat
TEST_REDIS_URL=redis://redis:6379
```

(`TEST_REDIS_URL`이 `REDIS_URL`과 같은 값이 되는 게 맞다 — CI 환경(`deploy.yml`)도 이미 두 값이 동일하게 `localhost:6379`로 설정되어 있어서, 이 프로젝트의 Redis는 애초에 dev/test용으로 논리적으로 분리되어 있지 않다. 대신 Step 3에서 테스트마다 완전히 비워주는 방식으로 격리한다.)

- [ ] **Step 2: `Makefile`의 `backend-test` 타겟을 도커 컨테이너 안에서 실행하도록 변경**

현재:
```makefile
# 전체 통합 테스트 실행 (로컬에서 직접)
backend-test:
	cd backend && pytest . -v
```

변경:
```makefile
# 전체 통합 테스트 실행 (backend 컨테이너 안에서 — REDIS_URL 등 도커 네트워크 호스트명이 정상 해석되어야 하므로)
backend-test:
	docker compose exec backend pytest . -v
```

- [ ] **Step 3: `conftest.py`의 `override_redis` fixture에 매 테스트 시작 전 전체 flush 추가**

`test_redis_client` 생성 직후, `monkeypatch.setattr` 호출들보다 **앞에** 한 줄 추가 (테스트마다 Redis를 완전히 비워서, 앞으로 추가할 rate limit 카운터가 테스트 사이에 누적되지 않도록 함 — `db` fixture가 매 테스트마다 테이블을 drop하는 것과 같은 목적):

```python
@pytest_asyncio.fixture(autouse=True)
async def override_redis(monkeypatch):
    test_redis_client = aioredis.from_url(url=settings.TEST_REDIS_URL, decode_responses=True)
    await test_redis_client.flushdb()  # 이번 태스크에서 추가: 매 테스트 시작 전 Redis 전체 비우기

    monkeypatch.setattr("app.core.redis.redis_client", test_redis_client)
    monkeypatch.setattr("app.managers.pubsub.redis_client", test_redis_client)
    monkeypatch.setattr("app.managers.presence.redis_client", test_redis_client)

    yield

    await test_redis_client.aclose()
```

- [ ] **Step 4: 변경된 `.env.local`을 backend 컨테이너에 반영**

`docker compose exec`은 이미 떠 있는 컨테이너 안에서 명령만 실행하는 것이라, `env_file`로 로드되는 환경변수는 컨테이너를 다시 만들어야 반영된다.

Run: `docker compose up -d backend`
Expected: `backend` 컨테이너가 재생성됨 (`Recreating` 로그)

- [ ] **Step 5: `test_chat` DB가 이미 만들어져 있는지 확인, 없으면 생성**

Run: `docker compose exec db psql -U maengjh -d chat -lqt | cut -d'|' -f1 | grep -qw test_chat && echo "exists" || make backend-test-init-db`
Expected: `exists` 출력되거나, 없었다면 `CREATE DATABASE` 성공 메시지

- [ ] **Step 6: 기존 테스트 스위트가 전부 통과하는지 확인 (아직 rate limiting 코드는 없음 — 순수하게 실행 방식 전환만 검증)**

Run: `make backend-test`
Expected: `tests/integration/test_auth.py`, `tests/integration/test_rooms.py`, `tests/unit/test_websocket.py`의 모든 테스트가 `PASSED`, 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add Makefile backend/tests/conftest.py
git commit -m "test: backend - 로컬 테스트를 도커 컨테이너 내부에서 실행하도록 전환 (slowapi Redis storage 대비)"
```

(`backend/.env.local`은 `.gitignore` 대상이라 커밋에 포함되지 않는다 — 로컬에만 반영되어 있으면 된다.)

---

### Task 2: 백엔드 — slowapi 설치 + 전역 기본 rate limit + 에러 응답 통합

**Files:**
- Modify: `backend/requirements.txt` (**사용자 직접 작성**)
- Create: `backend/app/core/limiter.py` (**사용자 직접 작성**)
- Modify: `backend/app/core/exceptions.py` (**사용자 직접 작성**)
- Modify: `backend/app/core/error_handlers.py` (**사용자 직접 작성**)
- Modify: `backend/app/main.py` (**사용자 직접 작성**)
- Test: `backend/tests/integration/test_rate_limit.py` (신규 파일, **사용자 직접 작성**)

**Interfaces:**
- Consumes: `app.core.config.settings.REDIS_URL`(기존), `app.core.security.decode_token(token) -> str`(기존, `JWTError` raise)
- Produces: `app.core.limiter.limiter` — slowapi `Limiter` 인스턴스, Task 3에서 `@limiter.limit(...)` 데코레이터로 사용. `app.core.exceptions.ErrorCode.RATE_LIMIT_EXCEEDED`

**배경**: 이 태스크가 끝나면 REST 엔드포인트 전체에 분당 60회 기본 제한이 걸리고, 초과 시 프로젝트의 기존 에러 응답 포맷과 동일한 형태로 429가 내려간다.

- [ ] **Step 1: `slowapi` 설치 (버전 미고정 상태로 먼저 설치 → 실제 버전 확인 → 고정)**

`backend/requirements.txt` 맨 아래에 버전 없이 추가:
```
slowapi
```

Run: `docker compose build backend`
Expected: 빌드 성공, 로그에 `Successfully installed slowapi-<버전> limits-<버전> ...` 출력

Run: `docker compose run --rm backend pip show slowapi | grep Version`
Expected: 예) `Version: 0.1.9` — 이 버전 문자열을 그대로 다음 스텝에서 사용

`backend/requirements.txt`의 `slowapi` 줄을 방금 확인한 버전으로 고정 (예시, **실제 확인된 버전으로 대체**):
```
slowapi==0.1.9
```

Run: `docker compose build backend`
Expected: 빌드 성공 (버전 고정 후에도 동일하게 설치됨)

- [ ] **Step 2: `app/core/limiter.py` 생성**

```python
from fastapi import Request
from jose import JWTError

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.security import decode_token


def rate_limit_key(request: Request) -> str:
    # 인증된 요청(Authorization 헤더에 유효한 JWT)은 user_id 기준으로,
    # 그 외(로그인/회원가입처럼 토큰이 없는 요청)는 클라이언트 IP 기준으로 제한한다.
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header[len("bearer "):]
        try:
            user_id = decode_token(token)
            return f"user:{user_id}"
        except JWTError:
            pass
    return get_remote_address(request)


# storage_uri를 Redis로 지정해야 backend 인스턴스가 여러 대여도 카운터가 정확히 합산된다.
# (in-memory였다면 인스턴스별로 따로 세서, 실제 허용치가 인스턴스 수만큼 늘어나버림)
limiter = Limiter(
    key_func=rate_limit_key,
    default_limits=["60/minute"],
    storage_uri=settings.REDIS_URL,
)
```

- [ ] **Step 3: `app/core/exceptions.py`에 429 에러코드 추가**

`ErrorCode` 클래스의 `# 500` 줄 바로 위에 추가:
```python
    # 429
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    # 500
    INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR"
```

- [ ] **Step 4: `app/core/error_handlers.py`에 `RateLimitExceeded` 핸들러 등록**

전체를 아래로 교체:
```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.core.exceptions import AppError, ErrorCode


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": exc.error_code,
                "detail": exc.detail,
                "status_code": exc.status_code,
            },
        )

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        # slowapi가 limit 초과 시 던지는 예외. exc.detail은 "60 per 1 minute" 같은 사람이 읽는 문자열.
        return JSONResponse(
            status_code=429,
            content={
                "error_code": ErrorCode.RATE_LIMIT_EXCEEDED,
                "detail": f"요청이 너무 많습니다 ({exc.detail})",
                "status_code": 429,
            },
        )
```

- [ ] **Step 5: `app/main.py`에 `Limiter` 연결**

`from app.core.config import settings` 아래에 import 추가:
```python
from slowapi.middleware import SlowAPIMiddleware
from app.core.limiter import limiter
```

`app = FastAPI(title="WebSocket Chat", lifespan=lifespan)` 바로 다음 줄에 추가:
```python
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
```

(`SlowAPIMiddleware`가 있어야 `@limiter.limit(...)`로 직접 데코레이트하지 않은 나머지 모든 라우트에도 `default_limits`가 자동 적용된다. 데코레이트된 라우트는 미들웨어가 자동으로 건너뛰고 데코레이터 쪽 체크만 적용하므로 이중 카운팅은 없다.)

- [ ] **Step 6: 실패하는 테스트 작성**

`backend/tests/integration/test_rate_limit.py` 신규 생성:
```python
import pytest
from fastapi import status


################################################################################################
# 전역 기본 rate limit (60/minute) 테스트
################################################################################################
@pytest.mark.asyncio
async def test_default_rate_limit_applies_globally(client):
    # 인증도 DB도 필요 없는 /health로 전역 기본값을 검증
    for _ in range(60):
        response = await client.get("/health")
        assert response.status_code == status.HTTP_200_OK

    response = await client.get("/health")
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert response.json()["error_code"] == "RATE_LIMIT_EXCEEDED"
```

- [ ] **Step 7: 테스트 실패 확인 (아직 Limiter가 연결 안 됐으므로)**

`make backend-test`는 전체 스위트를 도는 타겟이라 특정 파일만 지정할 수 없으니, 이 파일만 볼 때는 `docker compose exec`를 직접 쓴다.

Run: `docker compose exec backend pytest tests/integration/test_rate_limit.py -v`
Expected: `test_default_rate_limit_applies_globally` FAIL (61번째 요청도 200을 반환해서 `assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS`에서 실패) — Step 2~5를 아직 안 했다면 여기서 실패해야 정상

- [ ] **Step 8: Step 2~5 적용 후 재실행하여 통과 확인**

Run: `docker compose exec backend pytest tests/integration/test_rate_limit.py -v`
Expected: PASSED

- [ ] **Step 9: 전체 스위트도 깨진 게 없는지 확인**

Run: `make backend-test`
Expected: 전부 PASSED (기존 테스트들도 `/health`류 반복 호출이 없어서 전역 60/minute에 걸릴 일이 없음)

- [ ] **Step 10: 커밋**

```bash
git add backend/requirements.txt backend/app/core/limiter.py backend/app/core/exceptions.py backend/app/core/error_handlers.py backend/app/main.py backend/tests/integration/test_rate_limit.py
git commit -m "feat: backend - slowapi + Redis storage로 REST 전역 기본 rate limit(60/minute) 추가"
```

---

### Task 3: 백엔드 — 로그인/회원가입 전용 제한 (10/minute)

**Files:**
- Modify: `backend/app/api/routes/auth.py` (**사용자 직접 작성**)
- Test: `backend/tests/integration/test_rate_limit.py` (Task 2에서 만든 파일에 추가, **사용자 직접 작성**)

**Interfaces:**
- Consumes: `app.core.limiter.limiter`(Task 2에서 생성)
- Produces: 없음 (이 태스크로 끝나는 기능)

**배경**: `login`/`register`는 인증 전 요청이라 전역 기본값(분당 60회, 인증된 사용자는 user_id 기준)보다 훨씬 낮은 값으로, IP 기준 무차별 대입 공격 방어가 목적이다. slowapi 제약상 `@limiter.limit(...)`로 데코레이트하는 라우트는 함수 시그니처에 `request: Request`가 반드시 있어야 한다 (없으면 slowapi가 요청을 가로챌 수 없음 — 공식 README에 명시된 제약).

- [ ] **Step 1: `backend/app/api/routes/auth.py` 전체를 아래로 교체**

```python
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import auth as auth_service
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.db.session import get_db
from app.core.limiter import limiter

router = APIRouter(prefix="/auth", tags=["auth"])


# POST /auth/register - 회원 가입
@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    description="회원 가입",
)
@limiter.limit("10/minute")
async def register(
    request: Request,  # slowapi가 요청을 가로채려면 반드시 필요 (실제로 값을 쓰진 않음)
    req: RegisterRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
):
    access_token = await auth_service.register(
        username=req.username,
        email=req.email,
        password=req.password,
        session=session,
    )

    return TokenResponse(access_token=access_token)


# POST /auth/login - 로그인
@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    description="로그인",
)
@limiter.limit("10/minute")
async def login(
    request: Request,
    req: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
):
    access_token = await auth_service.login(
        email=req.email,
        password=req.password,
        session=session,
    )

    return TokenResponse(access_token=access_token)
```

- [ ] **Step 2: 실패하는 테스트 추가**

`backend/tests/integration/test_rate_limit.py` 맨 아래에 추가:
```python
################################################################################################
# /auth/register 제한 (10/minute) 테스트
################################################################################################
@pytest.mark.asyncio
async def test_register_rate_limit(client):
    for i in range(10):
        response = await client.post(
            "/auth/register",
            json={"username": f"user{i}", "email": f"user{i}@test.co.kr", "password": "Aa123456789!"},
        )
        assert response.status_code == status.HTTP_201_CREATED

    response = await client.post(
        "/auth/register",
        json={"username": "user10", "email": "user10@test.co.kr", "password": "Aa123456789!"},
    )
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


################################################################################################
# /auth/login 제한 (10/minute) 테스트
################################################################################################
@pytest.mark.asyncio
async def test_login_rate_limit(client):
    await client.post(
        "/auth/register",
        json={"username": "juhee", "email": "juhee@test.co.kr", "password": "Aa123456789!"},
    )

    for _ in range(10):
        response = await client.post(
            "/auth/login", json={"email": "juhee@test.co.kr", "password": "Aa123456789!"}
        )
        assert response.status_code == status.HTTP_200_OK

    response = await client.post(
        "/auth/login", json={"email": "juhee@test.co.kr", "password": "Aa123456789!"}
    )
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
```

- [ ] **Step 3: Step 1 적용 전에 먼저 실행해서 실패 확인**

Run: `docker compose exec backend pytest tests/integration/test_rate_limit.py -v`
Expected: `test_register_rate_limit`, `test_login_rate_limit` 둘 다 FAIL (11번째 요청도 성공 응답을 반환)

- [ ] **Step 4: Step 1 적용 후 재실행하여 통과 확인**

Run: `docker compose exec backend pytest tests/integration/test_rate_limit.py -v`
Expected: 전부 PASSED

- [ ] **Step 5: 전체 스위트 확인**

Run: `make backend-test`
Expected: 전부 PASSED

- [ ] **Step 6: 커밋**

```bash
git add backend/app/api/routes/auth.py backend/tests/integration/test_rate_limit.py
git commit -m "feat: backend - 로그인/회원가입에 분당 10회 rate limit 추가"
```

---

### Task 4: 백엔드 — WebSocket `message.send` 제한 (10/10초)

**Files:**
- Modify: `backend/app/core/limiter.py` (**사용자 직접 작성**)
- Modify: `backend/app/core/enums.py` (**사용자 직접 작성**)
- Modify: `backend/app/api/websocket.py` (**사용자 직접 작성**)
- Test: `backend/tests/unit/test_ws_rate_limit.py` (신규 파일, **사용자 직접 작성**)

**Interfaces:**
- Consumes: `app.core.exceptions.ErrorCode.RATE_LIMIT_EXCEEDED`(Task 2), `app.managers.connection.manager.send_to_user(user_id, payload)`(기존)
- Produces: `app.core.limiter.ws_message_limiter`, `app.core.limiter.MESSAGE_SEND_LIMIT` — 둘 다 `websocket.py`에서 사용

**배경**: slowapi는 WebSocket을 지원하지 않으므로(Global Constraints 참고), `limits` 라이브러리를 직접 써서 REST와 별개의 카운터를 만든다. 같은 `settings.REDIS_URL`을 가리키므로 멀티 서버 환경에서도 정확히 합산된다.

- [ ] **Step 1: `app/core/limiter.py`에 WS용 제한기 추가**

파일 맨 아래에 추가:
```python
from limits import parse
from limits.storage import storage_from_string
from limits.strategies import FixedWindowRateLimiter

# slowapi는 아직 WebSocket을 지원하지 않아서(공식 문서에 명시됨), REST와 별개로
# slowapi가 내부적으로 쓰는 것과 같은 `limits` 라이브러리를 직접 사용한다.
# 같은 REDIS_URL을 바라보므로, 서버가 여러 대여도 유저별 카운트가 정확히 합산된다.
_ws_storage = storage_from_string(settings.REDIS_URL)
ws_message_limiter = FixedWindowRateLimiter(_ws_storage)
MESSAGE_SEND_LIMIT = parse("10/10 seconds")
```

(이 줄들은 파일 상단 import 블록이 아니라 파일 맨 아래, 기존 `limiter = Limiter(...)` 선언 다음에 추가한다.)

- [ ] **Step 2: `app/core/enums.py`의 `WSMessageType`에 `ERROR` 추가**

`ROOM_INVITE = "room.invite"` 바로 아래에 추가:
```python
    ROOM_INVITE = "room.invite"

    ERROR = "error"
```

- [ ] **Step 3: `app/api/websocket.py`의 `message.send` 분기에 제한 체크 추가**

파일 상단 import 블록에 추가:
```python
from app.core.limiter import ws_message_limiter, MESSAGE_SEND_LIMIT
from app.core.exceptions import ErrorCode
```

`if msg_type == WSMessageType.MESSAGE_SEND:` 바로 다음 줄에 아래 블록 삽입 (기존 `room_id = UUID(payload["room_id"])`보다 앞):
```python
                if msg_type == WSMessageType.MESSAGE_SEND:
                    if not ws_message_limiter.hit(MESSAGE_SEND_LIMIT, "ws:message_send", str(user.id)):
                        await manager.send_to_user(
                            user.id,
                            {
                                "type": WSMessageType.ERROR,
                                "error_code": ErrorCode.RATE_LIMIT_EXCEEDED,
                                "detail": "메시지를 너무 빠르게 보내고 있어요",
                            },
                        )
                        continue

                    room_id = UUID(payload["room_id"])
                    content = str(payload.get("content", "")).strip()
                    # (이하 기존 코드 그대로)
```

기존 `room_id = UUID(payload["room_id"])` 이후 코드(content 검증, DB 저장, pubsub.publish)는 전혀 손대지 않는다 — `message.send` 분기 맨 앞에 조기 종료(`continue`) 체크만 하나 추가하는 것.

- [ ] **Step 4: 실패하는 단위 테스트 작성**

`backend/tests/unit/test_ws_rate_limit.py` 신규 생성 (기존 `test_websocket.py`가 `ConnectionManager`를 `FakeWS`로 단위 테스트하는 것과 같은 스타일로, 전체 WS 프로토콜을 띄우지 않고 제한기 로직만 검증):
```python
from app.core.limiter import ws_message_limiter, MESSAGE_SEND_LIMIT


def test_message_send_limit_blocks_after_threshold():
    identifier = "test-user-ws-rate-limit"

    for _ in range(10):
        assert ws_message_limiter.hit(MESSAGE_SEND_LIMIT, "ws:message_send", identifier) is True

    assert ws_message_limiter.hit(MESSAGE_SEND_LIMIT, "ws:message_send", identifier) is False
```

- [ ] **Step 5: Step 1 적용 전에 먼저 실행해서 실패 확인**

Run: `docker compose exec backend pytest tests/unit/test_ws_rate_limit.py -v`
Expected: `ImportError` 또는 `AttributeError` (아직 `ws_message_limiter`가 없으므로) — FAIL

- [ ] **Step 6: Step 1~3 적용 후 재실행하여 통과 확인**

Run: `docker compose exec backend pytest tests/unit/test_ws_rate_limit.py -v`
Expected: PASSED

- [ ] **Step 7: 전체 스위트 확인**

Run: `make backend-test`
Expected: 전부 PASSED

- [ ] **Step 8: 실제 WebSocket 프로토콜로 수동 확인 (진단 스크립트)**

이전 재연결 작업 때 썼던 것과 같은 방식으로, 컨테이너 안에서 `websockets` 라이브러리로 실제 `/ws` 연결에 `message.send`를 11번 연속 보내서 11번째에 `type: error`가 오는지 직접 확인한다. 브라우저에서 로그인해서 얻은 JWT와, 그 유저가 속한 방의 `room_id`를 준비한 뒤:

```bash
docker cp /path/to/ws_message_spam_diag.py $(docker compose ps -q backend):/tmp/diag.py
docker compose exec backend python /tmp/diag.py <JWT> <room_id>
```

(진단 스크립트 자체는 이전 세션에서 쓴 `ws_multitab_diag.py`와 같은 구조로, `message.send`를 11번 연속 보내고 매번 응답을 받아 마지막 응답의 `type`이 `error`인지 출력하면 된다. 이 스크립트는 백엔드 코드가 아니라 검증용 임시 도구라 Claude가 직접 작성해도 된다.)

Expected: 처음 10개는 `message.new` 응답(브로드캐스트라 본인에게도 옴), 11번째는 `type: error`, `error_code: RATE_LIMIT_EXCEEDED`

- [ ] **Step 9: 커밋**

```bash
git add backend/app/core/limiter.py backend/app/core/enums.py backend/app/api/websocket.py backend/tests/unit/test_ws_rate_limit.py
git commit -m "feat: backend - WebSocket message.send에 10초당 10회 rate limit 추가"
```

---

### Task 5: 프론트엔드 — WS rate limit 에러 토스트 표시

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/hooks/useWebSocket.ts`
- Modify: `frontend/src/components/Chat/ChatLayout.tsx`

**Interfaces:**
- Consumes: 서버가 보내는 `{"type": "error", "error_code": string, "detail": string}` (Task 4에서 백엔드가 만든 페이로드)
- Produces: `useWebSocket`이 반환하는 `wsErrorMessage: string | null`, `clearWsErrorMessage: () => void` — Task 6 이후 다른 곳에서 참조하지 않음

**배경**: `message.send`가 rate limit에 걸리면 서버가 본인에게만 `type: error` 메시지를 보낸다. 지금 `useWebSocket.ts`의 `onmessage`는 이 타입을 처리하는 분기가 없어서 그냥 무시된다. 재연결 배너(`connectionStatus`)와 비슷한 패턴으로, 짧게 떴다 사라지는 토스트를 추가한다.

- [ ] **Step 1: `types/index.ts`에 `WSError` 타입 추가**

`WSPong` 인터페이스 바로 아래에 추가:
```ts
export interface WSError {
  type: 'error'
  error_code: string
  detail: string
}
```

`WSPayload` 유니언에 추가:
```ts
export type WSPayload =
  | WSMessageNew
  | WSPresenceUpdate
  | WSTypingIndicator
  | WSFriendRequest
  | WSFriendAccept
  | WSFriendDelete
  | WSRoomInvite
  | WSReactionUpdate
  | WSPong
  | WSError
```

- [ ] **Step 2: `useWebSocket.ts`에 에러 메시지 상태 추가**

**무엇을 왜 하는지**: 서버가 보낸 `type: error` 페이로드를 받아서 훅 바깥(UI)에서 쓸 수 있는 state로 노출한다. `connectionStatus`와 똑같이 `useState`로 관리하되, 연결 상태와 달리 "지금 막 도착한 에러 1건"이라는 일회성 이벤트라서, 화면에서 몇 초 뒤 자동으로 지울 수 있도록 `clearWsErrorMessage` 함수도 같이 내보낸다.

`connectionStatus` state 선언 바로 아래에 추가:
```ts
  // message.send가 rate limit에 걸렸을 때 서버가 보내는 에러 안내 문구.
  // null이면 표시할 에러 없음. UI(ChatLayout)에서 몇 초 후 자동으로 clearWsErrorMessage()를 불러 지운다.
  const [wsErrorMessage, setWsErrorMessage] = useState<string | null>(null)
```

`ws.onmessage` 안, `pong` 분기(`if (payload.type === 'pong') { ... }`) 바로 다음, `const { addMessage, ... } = useChatStore.getState()` 이전에 추가:
```ts
        if (payload.type === 'error') {
          setWsErrorMessage(payload.detail)
          return
        }
```

훅의 반환 객체에 추가:
```ts
  return {
    sendMessage, sendTypingStart, sendTypingStop, sendReadUpdate, sendReaction,
    connectionStatus, wsErrorMessage,
    clearWsErrorMessage: () => setWsErrorMessage(null),
  }
```

- [ ] **Step 3: `ChatLayout.tsx`에 토스트 UI 추가**

**무엇을 왜 하는지**: `wsErrorMessage`가 채워지면 화면 하단에 짧게 토스트를 띄우고, 3초 뒤 자동으로 사라지게 한다. 재연결 배너는 "연결이 정상화될 때까지" 계속 떠 있어야 하는 상태 표시라 상단에 고정했지만, 이건 "방금 이런 일이 있었다"는 일회성 알림이라 자동 소멸 타이머가 필요하고, 배너와 겹치지 않도록 하단에 둔다.

`useWebSocket(token)` 호출부를 아래로 교체:
```tsx
  const { sendMessage, sendTypingStart, sendTypingStop, sendReadUpdate, sendReaction, connectionStatus, wsErrorMessage, clearWsErrorMessage } = useWebSocket(token)

  // wsErrorMessage가 새로 생기면 3초 뒤 자동으로 지운다 (토스트 자동 소멸).
  // 의존성 배열에 wsErrorMessage를 넣어서, 짧은 간격으로 에러가 연달아 오면
  // 매번 타이머가 새로 시작되어(clean-up이 이전 타이머를 정리) 항상 마지막 메시지 기준 3초를 보장한다.
  useEffect(() => {
    if (!wsErrorMessage) return
    const timer = setTimeout(() => clearWsErrorMessage(), 3000)
    return () => clearTimeout(timer)
  }, [wsErrorMessage, clearWsErrorMessage])
```

JSX 반환부에서, 기존 재연결 배너 바로 다음에 토스트 추가:
```tsx
      {connectionStatus === 'reconnecting' && (
        <div style={styles.reconnectBanner}>연결이 끊겼습니다. 재연결 중...</div>
      )}
      {wsErrorMessage && (
        <div style={styles.wsErrorToast}>{wsErrorMessage}</div>
      )}
```

`styles` 객체의 `reconnectBanner` 다음에 스타일 추가:
```ts
  wsErrorToast: {
    position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 100,
    padding: '0.5rem 1rem', borderRadius: 8,
    background: '#ef4444', color: '#fff', fontSize: '0.8rem', fontWeight: 600,
    boxShadow: 'var(--shadow-modal)',
  },
```

- [ ] **Step 4: 타입 체크 + 빌드로 검증**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: 에러 없음, 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/types/index.ts frontend/src/hooks/useWebSocket.ts frontend/src/components/Chat/ChatLayout.tsx
git commit -m "feat: frontend - message.send rate limit 에러를 토스트로 안내"
```

---

### Task 6: 전체 통합 테스트

**Files:** 없음 (자동화 테스트 + 브라우저/스크립트 수동 검증)

- [ ] **Step 1: 자동화 테스트 스위트 최종 확인**

Run: `make backend-test`
Expected: `test_rate_limit.py`, `test_ws_rate_limit.py` 포함 전부 PASSED

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: 에러 없음

- [ ] **Step 2: 멀티 서버 시나리오 — Redis storage가 실제로 필요한 이유를 증명하는 핵심 테스트**

```bash
docker compose up -d --scale backend=2
```

로그인해서 얻은 JWT로, nginx(`localhost:8000`)를 통해 인증된 REST 엔드포인트(예: `GET /users/me` 같이 존재하는 인증 필요 엔드포인트)에 짧은 시간 안에 15회 연속 요청:

```bash
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer <JWT>" http://localhost:8000/users/me
done
```

Expected: nginx가 두 backend 인스턴스에 라운드로빈으로 분산해서(각 인스턴스는 개별적으로 7~8개씩만 봄) 처리하더라도, Redis에 카운터가 공유되어 있어서 11번째부터 `429` 출력. (만약 in-memory storage였다면 각 인스턴스가 자기가 받은 요청만 세서 15개 전부 200이 나왔을 것 — 이게 바로 이 설계가 필요한 이유.)

```bash
docker compose up -d --scale backend=1
```
(테스트 끝나면 원래대로 복구)

- [ ] **Step 3: 수동 브라우저 테스트 — 로그인 폼**

로그인 화면에서 일부러 틀린 비밀번호로 11번 연속 로그인 시도 → 11번째에서 "요청이 너무 많습니다" 같은 에러 메시지가 표시되는지 확인 (프론트에 이미 있는 API 에러 처리 경로를 그대로 타는지도 함께 확인 — 별도 처리가 없다면 이 스텝에서 발견해서 보완).

- [ ] **Step 4: 수동 브라우저 테스트 — 채팅 메시지 연타**

채팅창에서 메시지를 빠르게 11번 이상 연속 전송 → 10번째까지는 정상 전송되고, 11번째부터는 화면 하단에 토스트("메시지를 너무 빠르게 보내고 있어요")가 3초간 떴다가 사라지는지 확인. 개발자도구 Network 탭에서 WS 프레임을 보면 11번째부터 서버로부터 `type: error`가 오는지도 확인.

- [ ] **Step 5: 문제 없으면 최종 커밋 없음**

이 태스크는 검증 전용이라 코드 변경이 없다. 문제가 발견되면 해당 태스크로 돌아가 수정 후 다시 커밋한다.

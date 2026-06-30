# WebSocket Chat — Implementation Plan

> **새 대화에서 이 파일을 열면:** 아래 "현재 진행 상황"을 먼저 확인하고, 체크되지 않은 첫 번째 Task부터 이어서 진행한다.

> **Task 완료 시:** 해당 Task의 모든 Step을 `- [x]` 로 체크하고, CLAUDE.md의 Task 현황도 함께 업데이트한다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DM + 채팅방, JWT 인증, 타이핑 인디케이터, 온라인 상태, 읽음 확인을 지원하는 실시간 채팅 앱 구축

**Architecture:** FastAPI WebSocket 서버가 모든 실시간 통신을 처리하고 REST API는 인증/채팅방/히스토리에 사용. 사용자당 단일 WebSocket 연결로 모든 방의 메시지를 처리하며, ConnectionManager가 인메모리로 연결을 관리. 프론트엔드는 React+Vite, Zustand로 상태 관리.

**Tech Stack:** Python 3.12, FastAPI 0.111, SQLAlchemy 2 async, asyncpg, PostgreSQL 16, python-jose, passlib, Alembic, React 18, TypeScript 5, Vite 5, Zustand 4, vite-plugin-pwa, Docker, docker-compose

## Global Constraints

- Python 3.12+, Node 20+
- 모든 DB 작업은 async (asyncpg 드라이버)
- 환경변수는 `.env`에서 로드, `.env.example` 제공
- 테스트는 pytest-asyncio + 실제 PostgreSQL (`test_chat` DB)
- WebSocket 메시지는 JSON 텍스트 프레임만 사용
- UUID는 `uuid.UUID` 타입 (문자열 캐스팅 금지)
- 프론트 CORS origin: `http://localhost:5173` (개발), `*` 는 사용 금지

---

## File Map

```
websocket-chat/
├── docker-compose.yml
├── .env.example
├── .github/workflows/ci.yml
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/env.py
│   ├── alembic/versions/001_initial.py
│   ├── app/
│   │   ├── main.py
│   │   ├── core/config.py
│   │   ├── core/security.py
│   │   ├── db/session.py
│   │   ├── db/models.py
│   │   ├── schemas/auth.py
│   │   ├── schemas/user.py
│   │   ├── schemas/room.py
│   │   ├── schemas/message.py
│   │   ├── api/deps.py
│   │   ├── api/routes/auth.py
│   │   ├── api/routes/users.py
│   │   ├── api/routes/rooms.py
│   │   ├── api/routes/messages.py
│   │   ├── api/websocket.py
│   │   └── managers/connection.py
│   └── tests/
│       ├── conftest.py
│       ├── test_auth.py
│       ├── test_rooms.py
│       ├── test_messages.py
│       └── test_websocket.py
│
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    ├── public/manifest.json
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── types/index.ts
        ├── api/client.ts
        ├── store/auth.ts
        ├── store/chat.ts
        ├── hooks/useWebSocket.ts
        ├── components/Auth/LoginForm.tsx
        ├── components/Auth/RegisterForm.tsx
        ├── components/Sidebar/Sidebar.tsx
        ├── components/Chat/ChatWindow.tsx
        ├── components/Chat/MessageBubble.tsx
        ├── components/Chat/MessageInput.tsx
        └── components/Chat/TypingIndicator.tsx
```

---

### Task 1: 프로젝트 인프라 (docker-compose + Dockerfiles + 폴더 구조)

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `backend/Dockerfile`
- Create: `backend/requirements.txt`
- Create: `frontend/Dockerfile`

**Interfaces:**
- Produces: `docker-compose up --build` 로 backend(8000), frontend(5173), db(5432) 세 서비스 실행

- [ ] **Step 1: 루트 폴더 구조 생성**

```bash
mkdir -p backend/app/core backend/app/db backend/app/schemas \
         backend/app/api/routes backend/app/managers backend/tests \
         backend/alembic/versions \
         frontend/src/components/Auth frontend/src/components/Sidebar \
         frontend/src/components/Chat frontend/src/hooks \
         frontend/src/store frontend/src/api frontend/src/types \
         frontend/public \
         .github/workflows
touch backend/app/__init__.py backend/app/core/__init__.py \
      backend/app/db/__init__.py backend/app/schemas/__init__.py \
      backend/app/api/__init__.py backend/app/api/routes/__init__.py \
      backend/app/managers/__init__.py backend/tests/__init__.py
```

- [ ] **Step 2: `.env.example` 작성**

```
DATABASE_URL=postgresql+asyncpg://chat:chat@db:5432/chat
TEST_DATABASE_URL=postgresql+asyncpg://chat:chat@localhost:5432/test_chat
SECRET_KEY=change-me-in-production-use-openssl-rand-hex-32
ACCESS_TOKEN_EXPIRE_DAYS=7
```

- [ ] **Step 3: `docker-compose.yml` 작성**

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: chat
      POSTGRES_PASSWORD: chat
      POSTGRES_DB: chat
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chat"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://chat:chat@db:5432/chat
      SECRET_KEY: dev-secret-key
      ACCESS_TOKEN_EXPIRE_DAYS: "7"
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build: ./frontend
    command: npm run dev -- --host
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://localhost:8000
      VITE_WS_URL: ws://localhost:8000

volumes:
  pgdata:
```

- [ ] **Step 4: `backend/requirements.txt` 작성**

```
fastapi==0.111.0
uvicorn[standard]==0.30.1
sqlalchemy[asyncio]==2.0.31
asyncpg==0.29.0
alembic==1.13.2
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
pydantic[email]==2.8.2
pydantic-settings==2.3.4
httpx==0.27.0
pytest==8.3.2
pytest-asyncio==0.23.8
websockets==12.0
```

- [ ] **Step 5: `backend/Dockerfile` 작성**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
```

- [ ] **Step 6: `frontend/Dockerfile` 작성**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
```

- [ ] **Step 7: `.gitignore` 업데이트**

```
.env
__pycache__/
*.pyc
.pytest_cache/
node_modules/
dist/
.vite/
```

- [ ] **Step 8: 빌드 확인**

```bash
docker-compose build
```
Expected: 에러 없이 세 이미지 빌드 완료

- [ ] **Step 9: Commit**

```bash
git add docker-compose.yml .env.example backend/Dockerfile backend/requirements.txt frontend/Dockerfile .gitignore
git commit -m "chore: 프로젝트 인프라 설정 (docker-compose, Dockerfiles)"
```

---

### Task 2: 백엔드 DB 모델 + FastAPI 앱 진입점

**Files:**
- Create: `backend/app/core/config.py`
- Create: `backend/app/db/models.py`
- Create: `backend/app/db/session.py`
- Create: `backend/app/main.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`

**Interfaces:**
- Produces: `GET /health` → `{"status": "ok"}`
- Produces: `User`, `Room`, `RoomMember`, `Message` SQLAlchemy 모델
- Produces: `get_db()` AsyncSession 제너레이터

- [ ] **Step 1: `backend/app/core/config.py` 작성**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://chat:chat@db:5432/chat"
    SECRET_KEY: str = "change-me"
    ACCESS_TOKEN_EXPIRE_DAYS: int = 7

    class Config:
        env_file = ".env"

settings = Settings()
```

- [ ] **Step 2: `backend/app/db/models.py` 작성**

```python
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Room(Base):
    __tablename__ = "rooms"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    is_dm = Column(Boolean, default=False, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class RoomMember(Base):
    __tablename__ = "room_members"
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id"), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    joined_at = Column(DateTime, default=datetime.utcnow)
    last_read_at = Column(DateTime, default=datetime.utcnow)

class Message(Base):
    __tablename__ = "messages"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id"), nullable=False)
    sender_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 3: `backend/app/db/session.py` 작성**

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```

- [ ] **Step 4: `backend/app/main.py` 작성**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="WebSocket Chat")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 5: `backend/alembic.ini` 작성**

```ini
[alembic]
script_location = alembic
sqlalchemy.url = postgresql+asyncpg://chat:chat@db:5432/chat

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

- [ ] **Step 6: `backend/alembic/env.py` 작성**

```python
import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
from app.db.models import Base
from app.core.config import settings

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def run_migrations_offline():
    context.configure(url=settings.DATABASE_URL, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()

def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()

async def run_migrations_online():
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

- [ ] **Step 7: 초기 마이그레이션 생성 (DB 컨테이너 실행 필요)**

```bash
docker-compose up -d db
# DB가 올라올 때까지 잠시 대기
docker-compose run --rm backend alembic revision --autogenerate -m "initial"
docker-compose run --rm backend alembic upgrade head
```

Expected: `alembic/versions/` 에 마이그레이션 파일 생성, 테이블 4개 생성

- [ ] **Step 8: health 엔드포인트 테스트**

```bash
docker-compose up -d
curl http://localhost:8000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 9: Commit**

```bash
git add backend/
git commit -m "feat(backend): DB 모델, Alembic 마이그레이션, FastAPI 앱 진입점"
```

---

### Task 3: JWT 인증 (회원가입 / 로그인)

**Files:**
- Create: `backend/app/core/security.py`
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/api/deps.py`
- Create: `backend/app/api/routes/auth.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Produces: `POST /auth/register` → `{access_token, token_type}`
- Produces: `POST /auth/login` → `{access_token, token_type}`
- Produces: `get_current_user(token) -> User` (의존성 주입용)

- [ ] **Step 1: `backend/app/core/security.py` 작성**

```python
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=settings.ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": user_id, "exp": expire}, settings.SECRET_KEY, algorithm="HS256")

def decode_token(token: str) -> str:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    return payload["sub"]
```

- [ ] **Step 2: `backend/app/schemas/auth.py` 작성**

```python
from pydantic import BaseModel, EmailStr

class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
```

- [ ] **Step 3: `backend/app/api/deps.py` 작성**

```python
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError
from app.db.session import get_db
from app.db.models import User
from app.core.security import decode_token

bearer_scheme = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        user_id = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
```

- [ ] **Step 4: `backend/app/api/routes/auth.py` 작성**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import User
from app.core.security import hash_password, verify_password, create_access_token
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return TokenResponse(access_token=create_access_token(str(user.id)))

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(str(user.id)))
```

- [ ] **Step 5: `backend/app/main.py` 에 auth 라우터 등록**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import auth

app = FastAPI(title="WebSocket Chat")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 6: `backend/tests/conftest.py` 작성**

```python
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.main import app
from app.db.session import get_db
from app.db.models import Base

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://chat:chat@localhost:5432/test_chat",
)

@pytest_asyncio.fixture(scope="function")
async def db():
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest_asyncio.fixture
async def client(db):
    async def override_db():
        yield db
    app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
```

- [ ] **Step 7: `backend/tests/test_auth.py` 작성 (실패 확인용)**

```python
import pytest

@pytest.mark.asyncio
async def test_register_success(client):
    res = await client.post("/auth/register", json={
        "username": "juhee",
        "email": "juhee@example.com",
        "password": "password123",
    })
    assert res.status_code == 201
    assert "access_token" in res.json()

@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    data = {"username": "juhee", "email": "juhee@example.com", "password": "pw"}
    await client.post("/auth/register", json=data)
    res = await client.post("/auth/register", json=data)
    assert res.status_code == 400

@pytest.mark.asyncio
async def test_login_success(client):
    await client.post("/auth/register", json={
        "username": "juhee", "email": "juhee@example.com", "password": "pw123"
    })
    res = await client.post("/auth/login", json={
        "email": "juhee@example.com", "password": "pw123"
    })
    assert res.status_code == 200
    assert "access_token" in res.json()

@pytest.mark.asyncio
async def test_login_wrong_password(client):
    await client.post("/auth/register", json={
        "username": "juhee", "email": "juhee@example.com", "password": "pw123"
    })
    res = await client.post("/auth/login", json={
        "email": "juhee@example.com", "password": "wrong"
    })
    assert res.status_code == 401
```

- [ ] **Step 8: test_chat DB 생성 후 테스트 실행**

```bash
# test_chat DB 생성 (최초 1회)
docker-compose exec db psql -U chat -c "CREATE DATABASE test_chat;"

# 백엔드 컨테이너에서 테스트 실행
docker-compose run --rm -e TEST_DATABASE_URL=postgresql+asyncpg://chat:chat@db:5432/test_chat \
  backend pytest tests/test_auth.py -v
```

Expected:
```
tests/test_auth.py::test_register_success PASSED
tests/test_auth.py::test_register_duplicate_email PASSED
tests/test_auth.py::test_login_success PASSED
tests/test_auth.py::test_login_wrong_password PASSED
4 passed
```

- [ ] **Step 9: Commit**

```bash
git add backend/
git commit -m "feat(backend): JWT 회원가입/로그인 구현 + 인증 테스트"
```

---

### Task 4: REST API — Users, Rooms, Messages

**Files:**
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/schemas/room.py`
- Create: `backend/app/schemas/message.py`
- Create: `backend/app/api/routes/users.py`
- Create: `backend/app/api/routes/rooms.py`
- Create: `backend/app/api/routes/messages.py`
- Create: `backend/tests/test_rooms.py`
- Create: `backend/tests/test_messages.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Produces: `GET /users` → `[UserResponse]`
- Produces: `GET /rooms` → `[RoomResponse]`
- Produces: `POST /rooms` → `RoomResponse`
- Produces: `POST /rooms/dm` → `RoomResponse`
- Produces: `GET /rooms/{room_id}/messages` → `[MessageResponse]`

- [ ] **Step 1: `backend/app/schemas/user.py` 작성**

```python
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

class UserResponse(BaseModel):
    id: UUID
    username: str
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: `backend/app/schemas/room.py` 작성**

```python
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

class CreateRoomRequest(BaseModel):
    name: str

class CreateDMRequest(BaseModel):
    target_user_id: UUID

class RoomResponse(BaseModel):
    id: UUID
    name: str
    is_dm: bool
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 3: `backend/app/schemas/message.py` 작성**

```python
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel
from app.schemas.user import UserResponse

class MessageResponse(BaseModel):
    id: UUID
    room_id: UUID
    sender: UserResponse
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: `backend/app/api/routes/users.py` 작성**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import User
from app.api.deps import get_current_user
from app.schemas.user import UserResponse

router = APIRouter(prefix="/users", tags=["users"])

@router.get("", response_model=list[UserResponse])
async def list_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id != current_user.id))
    return result.scalars().all()
```

- [ ] **Step 5: `backend/app/api/routes/rooms.py` 작성**

```python
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.db.session import get_db
from app.db.models import User, Room, RoomMember
from app.api.deps import get_current_user
from app.schemas.room import CreateRoomRequest, CreateDMRequest, RoomResponse

router = APIRouter(prefix="/rooms", tags=["rooms"])

@router.get("", response_model=list[RoomResponse])
async def list_rooms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Room)
        .join(RoomMember, Room.id == RoomMember.room_id)
        .where(RoomMember.user_id == current_user.id)
    )
    return result.scalars().all()

@router.post("", response_model=RoomResponse, status_code=201)
async def create_room(
    body: CreateRoomRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    room = Room(name=body.name, is_dm=False, created_by=current_user.id)
    db.add(room)
    await db.flush()
    db.add(RoomMember(room_id=room.id, user_id=current_user.id))
    await db.commit()
    await db.refresh(room)
    return room

@router.post("/dm", response_model=RoomResponse, status_code=201)
async def create_or_get_dm(
    body: CreateDMRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 이미 존재하는 DM 방 조회
    my_dms = select(RoomMember.room_id).join(Room).where(
        RoomMember.user_id == current_user.id, Room.is_dm == True
    )
    their_dms = select(RoomMember.room_id).join(Room).where(
        RoomMember.user_id == body.target_user_id, Room.is_dm == True
    )
    result = await db.execute(
        select(Room).where(Room.id.in_(my_dms), Room.id.in_(their_dms))
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    # 대상 유저 존재 확인
    target = await db.get(User, body.target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    room = Room(name=f"dm-{current_user.id}-{body.target_user_id}", is_dm=True, created_by=current_user.id)
    db.add(room)
    await db.flush()
    db.add(RoomMember(room_id=room.id, user_id=current_user.id))
    db.add(RoomMember(room_id=room.id, user_id=body.target_user_id))
    await db.commit()
    await db.refresh(room)
    return room

@router.post("/{room_id}/members/{user_id}", status_code=204)
async def add_member(
    room_id: UUID,
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    room = await db.get(Room, room_id)
    if not room or room.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    db.add(RoomMember(room_id=room_id, user_id=user_id))
    await db.commit()
```

- [ ] **Step 6: `backend/app/api/routes/messages.py` 작성**

```python
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.db.session import get_db
from app.db.models import User, Room, RoomMember, Message
from app.api.deps import get_current_user
from app.schemas.message import MessageResponse

router = APIRouter(prefix="/rooms", tags=["messages"])

@router.get("/{room_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    room_id: UUID,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await db.execute(
        select(RoomMember).where(
            RoomMember.room_id == room_id,
            RoomMember.user_id == current_user.id,
        )
    )
    if not member.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member")

    result = await db.execute(
        select(Message)
        .where(Message.room_id == room_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
        .options(selectinload(Message.sender))  # N+1 방지
    )
    return list(reversed(result.scalars().all()))
```

> **주의:** `selectinload(Message.sender)` 를 사용하려면 `Message` 모델에 relationship을 추가해야 함.

- [ ] **Step 7: `backend/app/db/models.py` 에 relationship 추가**

`Message` 클래스에 아래를 추가:

```python
from sqlalchemy.orm import relationship

class Message(Base):
    __tablename__ = "messages"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id"), nullable=False)
    sender_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    sender = relationship("User", lazy="raise")
```

- [ ] **Step 8: `backend/app/main.py` 에 라우터 등록**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import auth, users, rooms, messages

app = FastAPI(title="WebSocket Chat")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(rooms.router)
app.include_router(messages.router)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 9: `backend/tests/test_rooms.py` 작성**

```python
import pytest

async def _register_and_token(client, username, email):
    res = await client.post("/auth/register", json={"username": username, "email": email, "password": "pw"})
    return res.json()["access_token"]

@pytest.mark.asyncio
async def test_create_room(client):
    token = await _register_and_token(client, "alice", "alice@example.com")
    res = await client.post("/rooms", json={"name": "general"}, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 201
    assert res.json()["name"] == "general"
    assert res.json()["is_dm"] is False

@pytest.mark.asyncio
async def test_list_rooms(client):
    token = await _register_and_token(client, "alice", "alice@example.com")
    await client.post("/rooms", json={"name": "general"}, headers={"Authorization": f"Bearer {token}"})
    res = await client.get("/rooms", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert len(res.json()) == 1

@pytest.mark.asyncio
async def test_create_dm(client):
    token_a = await _register_and_token(client, "alice", "alice@example.com")
    token_b = await _register_and_token(client, "bob", "bob@example.com")
    users_res = await client.get("/users", headers={"Authorization": f"Bearer {token_a}"})
    bob_id = users_res.json()[0]["id"]

    res = await client.post("/rooms/dm", json={"target_user_id": bob_id}, headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 201
    assert res.json()["is_dm"] is True

    # 동일 DM 재요청 시 기존 방 반환
    res2 = await client.post("/rooms/dm", json={"target_user_id": bob_id}, headers={"Authorization": f"Bearer {token_a}"})
    assert res2.json()["id"] == res.json()["id"]
```

- [ ] **Step 10: 테스트 실행**

```bash
docker-compose run --rm -e TEST_DATABASE_URL=postgresql+asyncpg://chat:chat@db:5432/test_chat \
  backend pytest tests/test_rooms.py -v
```

Expected: 3 passed

- [ ] **Step 11: Commit**

```bash
git add backend/
git commit -m "feat(backend): Users/Rooms/Messages REST API 구현"
```

---

### Task 5: WebSocket 연결 관리자 (ConnectionManager)

**Files:**
- Create: `backend/app/managers/connection.py`
- Create: `backend/tests/test_websocket.py` (기본 연결 테스트)

**Interfaces:**
- Produces: `manager.connect(user_id, ws)` — 연결 등록
- Produces: `manager.disconnect(user_id)` — 연결 해제
- Produces: `manager.is_online(user_id) -> bool`
- Produces: `manager.send_to_user(user_id, payload)` — 특정 유저에게 전송
- Produces: `manager.broadcast_to_users(user_ids, payload, exclude_user_id)` — 여러 유저에게 전송
- Produces: `manager` 싱글턴 인스턴스

- [ ] **Step 1: `backend/app/managers/connection.py` 작성**

```python
import json
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # user_id(str) -> WebSocket
        self._connections: dict[str, WebSocket] = {}

    def connect(self, user_id: str, websocket: WebSocket) -> None:
        self._connections[user_id] = websocket

    def disconnect(self, user_id: str) -> None:
        self._connections.pop(user_id, None)

    def is_online(self, user_id: str) -> bool:
        return user_id in self._connections

    async def send_to_user(self, user_id: str, payload: dict) -> None:
        ws = self._connections.get(user_id)
        if ws:
            await ws.send_text(json.dumps(payload, default=str))

    async def broadcast_to_users(
        self,
        user_ids: list[str],
        payload: dict,
        exclude_user_id: str | None = None,
    ) -> None:
        for uid in user_ids:
            if uid != exclude_user_id:
                await self.send_to_user(uid, payload)

manager = ConnectionManager()
```

- [ ] **Step 2: `backend/tests/test_websocket.py` 작성**

```python
import pytest
from app.managers.connection import ConnectionManager

@pytest.mark.asyncio
async def test_connect_and_online():
    mgr = ConnectionManager()

    class FakeWS:
        sent = []
        async def send_text(self, text):
            self.sent.append(text)

    ws = FakeWS()
    mgr.connect("user-1", ws)
    assert mgr.is_online("user-1")
    assert not mgr.is_online("user-2")

@pytest.mark.asyncio
async def test_disconnect():
    mgr = ConnectionManager()
    class FakeWS:
        async def send_text(self, text): pass
    mgr.connect("user-1", FakeWS())
    mgr.disconnect("user-1")
    assert not mgr.is_online("user-1")

@pytest.mark.asyncio
async def test_send_to_user():
    mgr = ConnectionManager()
    class FakeWS:
        sent = []
        async def send_text(self, text):
            self.sent.append(text)
    ws = FakeWS()
    mgr.connect("user-1", ws)
    await mgr.send_to_user("user-1", {"type": "test", "msg": "hi"})
    assert len(ws.sent) == 1

@pytest.mark.asyncio
async def test_broadcast_excludes_sender():
    mgr = ConnectionManager()
    class FakeWS:
        def __init__(self): self.sent = []
        async def send_text(self, text): self.sent.append(text)
    ws1, ws2 = FakeWS(), FakeWS()
    mgr.connect("u1", ws1)
    mgr.connect("u2", ws2)
    await mgr.broadcast_to_users(["u1", "u2"], {"type": "msg"}, exclude_user_id="u1")
    assert len(ws1.sent) == 0
    assert len(ws2.sent) == 1
```

- [ ] **Step 3: 테스트 실행**

```bash
docker-compose run --rm backend pytest tests/test_websocket.py -v
```

Expected: 4 passed

- [ ] **Step 4: Commit**

```bash
git add backend/app/managers/ backend/tests/test_websocket.py
git commit -m "feat(backend): WebSocket ConnectionManager 구현"
```

---

### Task 6: WebSocket 엔드포인트 (메시지 전송)

**Files:**
- Create: `backend/app/api/websocket.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_websocket.py`

**Interfaces:**
- Consumes: `manager` (Task 5), `get_db`, `decode_token` (Task 3), `User`, `Room`, `RoomMember`, `Message` 모델
- Produces: `ws://서버/ws?token=...` WebSocket 엔드포인트
- Produces: `message.send` → DB 저장 + 방 멤버에게 `message.new` 브로드캐스트

- [ ] **Step 1: `backend/app/api/websocket.py` 작성**

```python
import json
from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError
from app.db.session import get_db
from app.db.models import User, Room, RoomMember, Message
from app.core.security import decode_token
from app.managers.connection import manager

router = APIRouter()

async def _get_room_member_ids(db: AsyncSession, room_id: UUID) -> list[str]:
    result = await db.execute(
        select(RoomMember.user_id).where(RoomMember.room_id == room_id)
    )
    return [str(uid) for uid in result.scalars().all()]

async def _broadcast_presence(db: AsyncSession, user: User, status: str) -> None:
    my_rooms = select(RoomMember.room_id).where(RoomMember.user_id == user.id)
    result = await db.execute(
        select(RoomMember.user_id)
        .where(RoomMember.room_id.in_(my_rooms))
        .where(RoomMember.user_id != user.id)
        .distinct()
    )
    peer_ids = [str(uid) for uid in result.scalars().all()]
    await manager.broadcast_to_users(
        peer_ids,
        {"type": "presence.update", "user_id": str(user.id), "status": status},
    )

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    # 인증
    try:
        user_id = decode_token(token)
    except JWTError:
        await websocket.close(code=4001)
        return

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    manager.connect(str(user.id), websocket)
    await _broadcast_presence(db, user, "online")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = payload.get("type")

            if msg_type == "message.send":
                room_id = UUID(payload["room_id"])
                content = str(payload.get("content", "")).strip()
                if not content:
                    continue

                # 멤버 확인
                member_result = await db.execute(
                    select(RoomMember).where(
                        RoomMember.room_id == room_id,
                        RoomMember.user_id == user.id,
                    )
                )
                if not member_result.scalar_one_or_none():
                    continue

                # DB 저장
                msg = Message(room_id=room_id, sender_id=user.id, content=content)
                db.add(msg)
                await db.commit()
                await db.refresh(msg)

                # 방 멤버에게 브로드캐스트
                member_ids = await _get_room_member_ids(db, room_id)
                await manager.broadcast_to_users(
                    member_ids,
                    {
                        "type": "message.new",
                        "id": str(msg.id),
                        "room_id": str(room_id),
                        "sender": {"id": str(user.id), "username": user.username},
                        "content": content,
                        "created_at": msg.created_at.isoformat(),
                    },
                )

    except WebSocketDisconnect:
        manager.disconnect(str(user.id))
        await _broadcast_presence(db, user, "offline")
```

- [ ] **Step 2: `backend/app/main.py` 에 WebSocket 라우터 등록**

```python
from app.api import websocket as ws_router
# ... 기존 import ...
app.include_router(ws_router.router)
```

- [ ] **Step 3: `backend/tests/test_websocket.py` 에 통합 테스트 추가**

```python
# 기존 단위 테스트 아래에 추가

import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import get_db
import websockets

@pytest_asyncio.fixture
async def http_client(db):
    async def override():
        yield db
    app.dependency_overrides[get_db] = override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_ws_rejects_invalid_token(http_client):
    import websockets
    try:
        async with websockets.connect("ws://localhost:8000/ws?token=bad") as ws:
            await ws.recv()
        assert False, "Should have been rejected"
    except Exception:
        pass  # 연결 거부 예상
```

> **참고:** WebSocket 통합 테스트는 실제 서버가 실행 중이어야 함. CI에서는 `docker-compose up -d backend` 후 실행.

- [ ] **Step 4: 수동 테스트 (서버 실행 후)**

```bash
docker-compose up -d
# 브라우저 콘솔 또는 wscat으로 테스트
# npx wscat -c "ws://localhost:8000/ws?token=<JWT_TOKEN>"
```

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat(backend): WebSocket 엔드포인트 + 메시지 전송/브로드캐스트"
```

---

### Task 7: WebSocket 실시간 기능 (타이핑, 온라인 상태, 읽음 확인)

**Files:**
- Modify: `backend/app/api/websocket.py`

**Interfaces:**
- Consumes: `manager`, `RoomMember`, `Message` 모델 (Task 6에서 이미 사용 중)
- Produces: `typing.start` / `typing.stop` → `typing.indicator` 브로드캐스트
- Produces: `read.update` → DB `last_read_at` 업데이트

- [ ] **Step 1: `websocket.py` 의 while 루프에 타이핑/읽음 핸들러 추가**

`if msg_type == "message.send":` 블록 아래에 추가:

```python
            elif msg_type in ("typing.start", "typing.stop"):
                room_id = UUID(payload["room_id"])
                is_typing = msg_type == "typing.start"
                member_ids = await _get_room_member_ids(db, room_id)
                await manager.broadcast_to_users(
                    member_ids,
                    {
                        "type": "typing.indicator",
                        "room_id": str(room_id),
                        "username": user.username,
                        "is_typing": is_typing,
                    },
                    exclude_user_id=str(user.id),
                )

            elif msg_type == "read.update":
                room_id = UUID(payload["room_id"])
                result = await db.execute(
                    select(RoomMember).where(
                        RoomMember.room_id == room_id,
                        RoomMember.user_id == user.id,
                    )
                )
                member = result.scalar_one_or_none()
                if member:
                    member.last_read_at = datetime.utcnow()
                    await db.commit()
```

- [ ] **Step 2: 타이핑 단위 테스트 추가 (`tests/test_websocket.py`)**

```python
@pytest.mark.asyncio
async def test_typing_broadcast():
    mgr = ConnectionManager()
    class FakeWS:
        def __init__(self): self.sent = []
        async def send_text(self, text): self.sent.append(text)
    ws1, ws2 = FakeWS(), FakeWS()
    mgr.connect("u1", ws1)
    mgr.connect("u2", ws2)
    await mgr.broadcast_to_users(
        ["u1", "u2"],
        {"type": "typing.indicator", "room_id": "r1", "username": "alice", "is_typing": True},
        exclude_user_id="u1",
    )
    assert len(ws1.sent) == 0
    assert len(ws2.sent) == 1
    import json
    assert json.loads(ws2.sent[0])["is_typing"] is True
```

- [ ] **Step 3: 테스트 실행**

```bash
docker-compose run --rm backend pytest tests/test_websocket.py -v
```

Expected: 5 passed

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/websocket.py backend/tests/test_websocket.py
git commit -m "feat(backend): 타이핑 인디케이터, 읽음 확인 WebSocket 핸들러"
```

---

### Task 8: 프론트엔드 기반 설정 (React + Vite + TypeScript + Zustand)

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/store/auth.ts`
- Create: `frontend/src/store/chat.ts`

**Interfaces:**
- Produces: `useAuthStore` — `{token, setToken, logout}`
- Produces: `useChatStore` — `{rooms, messages, typing, presence, ...setters}`
- Produces: `apiClient` — axios 인스턴스 (Authorization 헤더 자동 주입)

- [ ] **Step 1: `frontend/package.json` 작성**

```json
{
  "name": "websocket-chat-frontend",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest"
  },
  "dependencies": {
    "axios": "^1.7.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.4"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.3",
    "vite": "^5.3.4",
    "vite-plugin-pwa": "^0.20.0",
    "vitest": "^2.0.3"
  }
}
```

- [ ] **Step 2: `frontend/tsconfig.json` 작성**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: `frontend/vite.config.ts` 작성**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'WebSocket Chat',
        short_name: 'Chat',
        description: '실시간 채팅 앱',
        theme_color: '#6366f1',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
})
```

- [ ] **Step 4: `frontend/index.html` 작성**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WebSocket Chat</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: `frontend/src/types/index.ts` 작성**

```typescript
export interface User {
  id: string
  username: string
  email: string
  created_at: string
}

export interface Room {
  id: string
  name: string
  is_dm: boolean
  created_at: string
}

export interface Message {
  id: string
  room_id: string
  sender: Pick<User, 'id' | 'username'>
  content: string
  created_at: string
}
```

- [ ] **Step 6: `frontend/src/api/client.ts` 작성**

```typescript
import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const apiClient = axios.create({ baseURL: BASE_URL })

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
```

- [ ] **Step 7: `frontend/src/store/auth.ts` 작성**

```typescript
import { create } from 'zustand'
import type { User } from '../types'

interface AuthState {
  token: string | null
  me: User | null
  setToken: (token: string) => void
  setMe: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  me: null,
  setToken: (token) => {
    localStorage.setItem('token', token)
    set({ token })
  },
  setMe: (me) => set({ me }),
  logout: () => {
    localStorage.removeItem('token')
    set({ token: null, me: null })
  },
}))
```

- [ ] **Step 8: `frontend/src/store/chat.ts` 작성**

```typescript
import { create } from 'zustand'
import type { Room, Message } from '../types'

interface ChatState {
  rooms: Room[]
  currentRoomId: string | null
  messages: Record<string, Message[]>
  typing: Record<string, string[]>   // room_id -> [usernames currently typing]
  presence: Record<string, string>   // user_id -> 'online' | 'offline'
  setRooms: (rooms: Room[]) => void
  addRoom: (room: Room) => void
  setCurrentRoom: (id: string) => void
  setMessages: (roomId: string, msgs: Message[]) => void
  addMessage: (msg: Message) => void
  setTyping: (roomId: string, username: string, isTyping: boolean) => void
  setPresence: (userId: string, status: string) => void
}

export const useChatStore = create<ChatState>((set) => ({
  rooms: [],
  currentRoomId: null,
  messages: {},
  typing: {},
  presence: {},
  setRooms: (rooms) => set({ rooms }),
  addRoom: (room) => set((s) => ({ rooms: [...s.rooms, room] })),
  setCurrentRoom: (id) => set({ currentRoomId: id }),
  setMessages: (roomId, msgs) =>
    set((s) => ({ messages: { ...s.messages, [roomId]: msgs } })),
  addMessage: (msg) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [msg.room_id]: [...(s.messages[msg.room_id] ?? []), msg],
      },
    })),
  setTyping: (roomId, username, isTyping) =>
    set((s) => {
      const current = s.typing[roomId] ?? []
      const next = isTyping
        ? [...new Set([...current, username])]
        : current.filter((u) => u !== username)
      return { typing: { ...s.typing, [roomId]: next } }
    }),
  setPresence: (userId, status) =>
    set((s) => ({ presence: { ...s.presence, [userId]: status } })),
}))
```

- [ ] **Step 9: `frontend/src/main.tsx` 작성**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 10: `frontend/src/App.tsx` 작성 (뼈대만)**

```tsx
import { useAuthStore } from './store/auth'

export default function App() {
  const token = useAuthStore((s) => s.token)
  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      {token ? <p>로그인됨</p> : <p>로그인 필요</p>}
    </div>
  )
}
```

- [ ] **Step 11: `frontend/src/index.css` 생성 (CSS 리셋)**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
```

- [ ] **Step 12: npm 설치 + 빌드 확인**

```bash
docker-compose run --rm frontend npm install
docker-compose up frontend
```

브라우저에서 `http://localhost:5173` 접속 → "로그인 필요" 표시 확인

- [ ] **Step 13: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): React+Vite+TypeScript+Zustand 기반 설정"
```

---

### Task 9: 프론트엔드 Auth UI (로그인 / 회원가입)

**Files:**
- Create: `frontend/src/components/Auth/LoginForm.tsx`
- Create: `frontend/src/components/Auth/RegisterForm.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `apiClient`, `useAuthStore`
- Produces: 로그인/회원가입 폼 → 토큰 저장 → 메인 화면 전환

- [ ] **Step 1: `frontend/src/components/Auth/LoginForm.tsx` 작성**

```tsx
import { useState } from 'react'
import { apiClient } from '../../api/client'
import { useAuthStore } from '../../store/auth'

interface Props { onSwitch: () => void }

export default function LoginForm({ onSwitch }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const setToken = useAuthStore((s) => s.setToken)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const res = await apiClient.post<{ access_token: string }>('/auth/login', { email, password })
      setToken(res.data.access_token)
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않습니다')
    }
  }

  return (
    <div style={styles.container}>
      <h2>로그인</h2>
      <form onSubmit={submit} style={styles.form}>
        <input style={styles.input} placeholder="이메일" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input style={styles.input} placeholder="비밀번호" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button style={styles.button} type="submit">로그인</button>
      </form>
      <p>계정이 없으신가요? <button onClick={onSwitch} style={styles.link}>회원가입</button></p>
    </div>
  )
}

const styles = {
  container: { maxWidth: 360, margin: '80px auto', padding: 24, border: '1px solid #e5e7eb', borderRadius: 8 },
  form: { display: 'flex', flexDirection: 'column' as const, gap: 12, marginBottom: 16 },
  input: { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 },
  button: { padding: '10px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  link: { background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', textDecoration: 'underline' },
}
```

- [ ] **Step 2: `frontend/src/components/Auth/RegisterForm.tsx` 작성**

```tsx
import { useState } from 'react'
import { apiClient } from '../../api/client'
import { useAuthStore } from '../../store/auth'

interface Props { onSwitch: () => void }

export default function RegisterForm({ onSwitch }: Props) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const setToken = useAuthStore((s) => s.setToken)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const res = await apiClient.post<{ access_token: string }>('/auth/register', { username, email, password })
      setToken(res.data.access_token)
    } catch {
      setError('이미 사용 중인 이메일입니다')
    }
  }

  return (
    <div style={styles.container}>
      <h2>회원가입</h2>
      <form onSubmit={submit} style={styles.form}>
        <input style={styles.input} placeholder="닉네임" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <input style={styles.input} placeholder="이메일" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input style={styles.input} placeholder="비밀번호" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button style={styles.button} type="submit">가입하기</button>
      </form>
      <p>이미 계정이 있으신가요? <button onClick={onSwitch} style={styles.link}>로그인</button></p>
    </div>
  )
}

const styles = {
  container: { maxWidth: 360, margin: '80px auto', padding: 24, border: '1px solid #e5e7eb', borderRadius: 8 },
  form: { display: 'flex', flexDirection: 'column' as const, gap: 12, marginBottom: 16 },
  input: { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 },
  button: { padding: '10px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  link: { background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', textDecoration: 'underline' },
}
```

- [ ] **Step 3: `frontend/src/App.tsx` 업데이트**

```tsx
import { useState } from 'react'
import { useAuthStore } from './store/auth'
import LoginForm from './components/Auth/LoginForm'
import RegisterForm from './components/Auth/RegisterForm'

export default function App() {
  const token = useAuthStore((s) => s.token)
  const [isLogin, setIsLogin] = useState(true)

  if (!token) {
    return isLogin
      ? <LoginForm onSwitch={() => setIsLogin(false)} />
      : <RegisterForm onSwitch={() => setIsLogin(true)} />
  }

  return <div style={{ padding: 24 }}>채팅 화면 (다음 단계)</div>
}
```

- [ ] **Step 4: 브라우저에서 수동 테스트**

```
1. http://localhost:5173 접속 → 로그인 폼 표시 확인
2. "회원가입" 클릭 → 회원가입 폼 전환 확인
3. 회원가입 완료 → "채팅 화면" 텍스트 표시 확인 (토큰 저장됨)
4. 새로고침 → 로그인 유지 확인 (localStorage)
```

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): 로그인/회원가입 UI 구현"
```

---

### Task 10: useWebSocket 훅

**Files:**
- Create: `frontend/src/hooks/useWebSocket.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useAuthStore`, `useChatStore`
- Produces: `useWebSocket()` → `{ send, isConnected }`
- WebSocket 메시지 수신 시 자동으로 store 업데이트

- [ ] **Step 1: `frontend/src/hooks/useWebSocket.ts` 작성**

```typescript
import { useEffect, useRef, useCallback, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { useChatStore } from '../store/chat'
import type { Message } from '../types'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000'

interface WSPayload {
  type: string
  [key: string]: unknown
}

export function useWebSocket() {
  const token = useAuthStore((s) => s.token)
  const { addMessage, setTyping, setPresence } = useChatStore()
  const wsRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!token) return

    const ws = new WebSocket(`${WS_URL}/ws?token=${token}`)
    wsRef.current = ws

    ws.onopen = () => setIsConnected(true)

    ws.onmessage = (event) => {
      const payload: WSPayload = JSON.parse(event.data)
      switch (payload.type) {
        case 'message.new':
          addMessage(payload as unknown as Message)
          break
        case 'typing.indicator':
          setTyping(payload.room_id as string, payload.username as string, payload.is_typing as boolean)
          break
        case 'presence.update':
          setPresence(payload.user_id as string, payload.status as string)
          break
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      wsRef.current = null
    }

    return () => {
      ws.close()
    }
  }, [token])

  const send = useCallback((data: WSPayload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { send, isConnected }
}
```

- [ ] **Step 2: `frontend/src/App.tsx` 에 훅 연결**

```tsx
import { useState } from 'react'
import { useAuthStore } from './store/auth'
import { useWebSocket } from './hooks/useWebSocket'
import LoginForm from './components/Auth/LoginForm'
import RegisterForm from './components/Auth/RegisterForm'

export default function App() {
  const token = useAuthStore((s) => s.token)
  const [isLogin, setIsLogin] = useState(true)
  const { isConnected } = useWebSocket()

  if (!token) {
    return isLogin
      ? <LoginForm onSwitch={() => setIsLogin(false)} />
      : <RegisterForm onSwitch={() => setIsLogin(true)} />
  }

  return (
    <div style={{ padding: 24 }}>
      <p>WebSocket: {isConnected ? '🟢 연결됨' : '🔴 연결 중...'}</p>
      <p>채팅 화면 (다음 단계)</p>
    </div>
  )
}
```

- [ ] **Step 3: 브라우저에서 수동 테스트**

```
1. 로그인 후 "🟢 연결됨" 표시 확인
2. 브라우저 DevTools Network 탭 → WS 탭에서 연결 확인
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/ frontend/src/App.tsx
git commit -m "feat(frontend): useWebSocket 훅 구현"
```

---

### Task 11: 프론트엔드 앱 셸 (사이드바 + 채팅 레이아웃)

**Files:**
- Create: `frontend/src/components/Sidebar/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `apiClient`, `useAuthStore`, `useChatStore`, `useWebSocket`
- Produces: 사이드바 (채팅방 목록 + DM 목록 + 로그아웃), 방 선택 시 `currentRoomId` 업데이트

- [ ] **Step 1: `frontend/src/components/Sidebar/Sidebar.tsx` 작성**

```tsx
import { useEffect, useState } from 'react'
import { apiClient } from '../../api/client'
import { useAuthStore } from '../../store/auth'
import { useChatStore } from '../../store/chat'
import type { User } from '../../types'

export default function Sidebar() {
  const logout = useAuthStore((s) => s.logout)
  const me = useAuthStore((s) => s.me)
  const { rooms, currentRoomId, setRooms, addRoom, setCurrentRoom, presence } = useChatStore()
  const [users, setUsers] = useState<User[]>([])
  const [newRoomName, setNewRoomName] = useState('')

  useEffect(() => {
    apiClient.get('/rooms').then((r) => setRooms(r.data))
    apiClient.get('/users').then((r) => setUsers(r.data))
  }, [])

  const createRoom = async () => {
    if (!newRoomName.trim()) return
    const res = await apiClient.post('/rooms', { name: newRoomName })
    addRoom(res.data)
    setNewRoomName('')
  }

  const openDM = async (targetId: string) => {
    const res = await apiClient.post('/rooms/dm', { target_user_id: targetId })
    if (!rooms.find((r) => r.id === res.data.id)) addRoom(res.data)
    setCurrentRoom(res.data.id)
  }

  const chatRooms = rooms.filter((r) => !r.is_dm)
  const dmRooms = rooms.filter((r) => r.is_dm)

  return (
    <aside style={styles.sidebar}>
      <div style={styles.header}>
        <span style={{ fontWeight: 700 }}>💬 Chat</span>
        <button onClick={logout} style={styles.logoutBtn}>로그아웃</button>
      </div>

      <section style={styles.section}>
        <p style={styles.sectionTitle}>채팅방</p>
        {chatRooms.map((r) => (
          <div
            key={r.id}
            style={{ ...styles.item, background: currentRoomId === r.id ? '#e0e7ff' : undefined }}
            onClick={() => setCurrentRoom(r.id)}
          >
            # {r.name}
          </div>
        ))}
        <div style={styles.newRoom}>
          <input
            style={styles.input}
            placeholder="새 채팅방 이름"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createRoom()}
          />
        </div>
      </section>

      <section style={styles.section}>
        <p style={styles.sectionTitle}>DM</p>
        {dmRooms.map((r) => (
          <div
            key={r.id}
            style={{ ...styles.item, background: currentRoomId === r.id ? '#e0e7ff' : undefined }}
            onClick={() => setCurrentRoom(r.id)}
          >
            @ {r.name}
          </div>
        ))}
      </section>

      <section style={styles.section}>
        <p style={styles.sectionTitle}>유저</p>
        {users.map((u) => (
          <div key={u.id} style={styles.item} onClick={() => openDM(u.id)}>
            <span style={{ color: presence[u.id] === 'online' ? '#22c55e' : '#9ca3af' }}>●</span>{' '}
            {u.username}
          </div>
        ))}
      </section>
    </aside>
  )
}

const styles = {
  sidebar: { width: 240, minHeight: '100vh', borderRight: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', flexDirection: 'column' as const },
  header: { padding: '16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb' },
  logoutBtn: { fontSize: 12, padding: '4px 8px', cursor: 'pointer', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff' },
  section: { padding: '12px 0' },
  sectionTitle: { padding: '0 12px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, marginBottom: 4 },
  item: { padding: '6px 12px', cursor: 'pointer', fontSize: 14, borderRadius: 4, margin: '0 4px' },
  newRoom: { padding: '4px 12px' },
  input: { width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 },
}
```

- [ ] **Step 2: `frontend/src/App.tsx` 에 사이드바 포함**

```tsx
import { useState } from 'react'
import { useAuthStore } from './store/auth'
import { useWebSocket } from './hooks/useWebSocket'
import LoginForm from './components/Auth/LoginForm'
import RegisterForm from './components/Auth/RegisterForm'
import Sidebar from './components/Sidebar/Sidebar'

export default function App() {
  const token = useAuthStore((s) => s.token)
  const [isLogin, setIsLogin] = useState(true)
  useWebSocket()

  if (!token) {
    return isLogin
      ? <LoginForm onSwitch={() => setIsLogin(false)} />
      : <RegisterForm onSwitch={() => setIsLogin(true)} />
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 24 }}>
        채팅창 (다음 단계)
      </main>
    </div>
  )
}
```

- [ ] **Step 3: 브라우저에서 수동 테스트**

```
1. 로그인 → 사이드바 표시 확인
2. "새 채팅방 이름" 입력 + Enter → 채팅방 목록에 추가 확인
3. 유저 목록의 다른 유저 클릭 → DM 방 생성 확인
```

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): 사이드바 (채팅방/DM/유저 목록) 구현"
```

---

### Task 12: 프론트엔드 채팅 UI

**Files:**
- Create: `frontend/src/components/Chat/MessageBubble.tsx`
- Create: `frontend/src/components/Chat/TypingIndicator.tsx`
- Create: `frontend/src/components/Chat/MessageInput.tsx`
- Create: `frontend/src/components/Chat/ChatWindow.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `apiClient`, `useChatStore`, `useAuthStore`
- Produces: 메시지 목록 표시, 메시지 전송, 타이핑 인디케이터 표시
- **주의:** `useWebSocket()` 을 ChatWindow 안에서 호출하면 WebSocket 연결이 2개 생성됨. `send` 는 App.tsx 에서 호출한 `useWebSocket()` 결과를 prop으로 전달받는다.

- [ ] **Step 1: `frontend/src/components/Chat/MessageBubble.tsx` 작성**

```tsx
import type { Message } from '../../types'
import { useAuthStore } from '../../store/auth'

interface Props { message: Message }

export default function MessageBubble({ message }: Props) {
  const me = useAuthStore((s) => s.me)
  const isMine = me?.id === message.sender.id
  const time = new Date(message.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 }}>
      {!isMine && (
        <div style={styles.avatar}>{message.sender.username[0].toUpperCase()}</div>
      )}
      <div>
        {!isMine && <p style={styles.senderName}>{message.sender.username}</p>}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flexDirection: isMine ? 'row-reverse' : 'row' }}>
          <div style={{ ...styles.bubble, background: isMine ? '#6366f1' : '#f3f4f6', color: isMine ? '#fff' : '#111' }}>
            {message.content}
          </div>
          <span style={styles.time}>{time}</span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  avatar: { width: 32, height: 32, borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 },
  senderName: { fontSize: 12, color: '#6b7280', marginBottom: 2, marginLeft: 4 },
  bubble: { padding: '8px 12px', borderRadius: 12, fontSize: 14, maxWidth: 320, wordBreak: 'break-word' as const },
  time: { fontSize: 11, color: '#9ca3af', marginBottom: 2 },
}
```

- [ ] **Step 2: `frontend/src/components/Chat/TypingIndicator.tsx` 작성**

```tsx
interface Props { roomId: string; typing: Record<string, string[]> }

export default function TypingIndicator({ roomId, typing }: Props) {
  const users = typing[roomId] ?? []
  if (users.length === 0) return null
  const label = users.length === 1 ? `${users[0]}이 입력 중...` : `${users.join(', ')}이 입력 중...`
  return <p style={{ fontSize: 13, color: '#6b7280', padding: '4px 0', fontStyle: 'italic' }}>✏️ {label}</p>
}
```

- [ ] **Step 3: `frontend/src/components/Chat/MessageInput.tsx` 작성**

```tsx
import { useState, useRef } from 'react'

interface Props {
  onSend: (content: string) => void
  onTypingStart: () => void
  onTypingStop: () => void
}

export default function MessageInput({ onSend, onTypingStart, onTypingStop }: Props) {
  const [content, setContent] = useState('')
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value)
    onTypingStart()
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(onTypingStop, 2000)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed) return
    onSend(trimmed)
    setContent('')
    onTypingStop()
    if (typingTimer.current) clearTimeout(typingTimer.current)
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <input
        style={styles.input}
        value={content}
        onChange={handleChange}
        placeholder="메시지를 입력하세요..."
      />
      <button style={styles.button} type="submit">전송</button>
    </form>
  )
}

const styles = {
  form: { display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid #e5e7eb' },
  input: { flex: 1, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 },
  button: { padding: '10px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
}
```

- [ ] **Step 4: `frontend/src/components/Chat/ChatWindow.tsx` 작성**

```tsx
import { useEffect, useRef } from 'react'
import { apiClient } from '../../api/client'
import { useAuthStore } from '../../store/auth'
import { useChatStore } from '../../store/chat'
import { useWebSocket } from '../../hooks/useWebSocket'
import MessageBubble from './MessageBubble'
import TypingIndicator from './TypingIndicator'
import MessageInput from './MessageInput'

interface Props { send: (data: Record<string, unknown>) => void }

export default function ChatWindow({ send }: Props) {
  const { currentRoomId, messages, typing, setMessages } = useChatStore()
  const me = useAuthStore((s) => s.me)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!currentRoomId) return
    apiClient.get(`/rooms/${currentRoomId}/messages`).then((r) => setMessages(currentRoomId, r.data))
  }, [currentRoomId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (currentRoomId) send({ type: 'read.update', room_id: currentRoomId })
  }, [messages[currentRoomId ?? '']])

  if (!currentRoomId) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
        채팅방을 선택하세요
      </div>
    )
  }

  const roomMessages = messages[currentRoomId] ?? []

  const handleSend = (content: string) => {
    send({ type: 'message.send', room_id: currentRoomId, content })
  }

  const handleTypingStart = () => send({ type: 'typing.start', room_id: currentRoomId })
  const handleTypingStop = () => send({ type: 'typing.stop', room_id: currentRoomId })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {roomMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <TypingIndicator roomId={currentRoomId} typing={typing} />
        <div ref={bottomRef} />
      </div>
      <MessageInput onSend={handleSend} onTypingStart={handleTypingStart} onTypingStop={handleTypingStop} />
    </div>
  )
}
```

- [ ] **Step 5: `frontend/src/App.tsx` 최종 업데이트**

```tsx
import { useState, useEffect } from 'react'
import { useAuthStore } from './store/auth'
import { useWebSocket } from './hooks/useWebSocket'
import { apiClient } from './api/client'
import LoginForm from './components/Auth/LoginForm'
import RegisterForm from './components/Auth/RegisterForm'
import Sidebar from './components/Sidebar/Sidebar'
import ChatWindow from './components/Chat/ChatWindow'

export default function App() {
  const token = useAuthStore((s) => s.token)
  const { setMe } = useAuthStore()
  const [isLogin, setIsLogin] = useState(true)
  useWebSocket()

  useEffect(() => {
    if (token) {
      apiClient.get('/users').then(() => {}).catch(() => {})
      // /auth/me 엔드포인트가 없으므로 로컬 스토어에서 me는 register/login 시 별도 처리
    }
  }, [token])

  if (!token) {
    return isLogin
      ? <LoginForm onSwitch={() => setIsLogin(false)} />
      : <RegisterForm onSwitch={() => setIsLogin(true)} />
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <ChatWindow send={send} />
    </div>
  )
}
```

> **참고:** `/auth/me` 엔드포인트를 추가하거나 JWT를 디코드해서 `me` 를 채우는 것을 권장. 지금은 메시지 버블에서 `isMine` 비교가 작동하지 않을 수 있으므로 아래 단계에서 `/auth/me` 를 추가한다.

- [ ] **Step 6: `backend/app/api/routes/auth.py` 에 `/auth/me` 추가**

```python
from app.schemas.user import UserResponse
from app.api.deps import get_current_user

@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
```

- [ ] **Step 7: `frontend/src/App.tsx` 에서 `/auth/me` 로 유저 정보 로드**

`useEffect` 블록을 아래로 교체:

```tsx
useEffect(() => {
  if (token) {
    apiClient.get('/auth/me').then((r) => setMe(r.data)).catch(() => {})
  }
}, [token])
```

- [ ] **Step 8: 브라우저에서 수동 테스트 (브라우저 2개 필요)**

```
1. 브라우저 A, B에서 각각 회원가입 후 로그인
2. A에서 채팅방 생성 → A의 사이드바에 방 표시 확인
3. B의 사이드바에서 A 유저 클릭 → DM 방 생성
4. A에서 같은 DM 방 열기 (유저 목록에서 B 클릭)
5. A에서 메시지 전송 → B에 실시간으로 표시 확인
6. B에서 입력 중 → A에 타이핑 인디케이터 표시 확인
```

- [ ] **Step 9: Commit**

```bash
git add frontend/ backend/
git commit -m "feat: 채팅 UI 완성 (메시지 버블, 타이핑 인디케이터, 메시지 입력)"
```

---

### Task 13: CI/CD (GitHub Actions) + PWA 아이콘

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `frontend/public/manifest.json`
- Create: `frontend/public/icons/icon-192.png` (placeholder)
- Create: `frontend/public/icons/icon-512.png` (placeholder)

**Interfaces:**
- Produces: `git push` → pytest + vite build 자동 실행 → Render 자동 배포

- [ ] **Step 1: `.github/workflows/ci.yml` 작성**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: chat
          POSTGRES_PASSWORD: chat
          POSTGRES_DB: test_chat
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Install dependencies
        working-directory: backend
        run: pip install -r requirements.txt
      - name: Run tests
        working-directory: backend
        env:
          TEST_DATABASE_URL: postgresql+asyncpg://chat:chat@localhost:5432/test_chat
          SECRET_KEY: test-secret-key
        run: pytest tests/ -v

  frontend-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install dependencies
        working-directory: frontend
        run: npm ci
      - name: Build
        working-directory: frontend
        env:
          VITE_API_URL: https://your-app.onrender.com
          VITE_WS_URL: wss://your-app.onrender.com
        run: npm run build
```

> `your-app.onrender.com` 을 실제 Render 앱 URL로 교체할 것.

- [ ] **Step 2: PWA 아이콘 생성**

실제 아이콘 이미지가 없을 경우, 임시 아이콘을 생성:

```bash
# ImageMagick 설치 필요: brew install imagemagick
convert -size 192x192 xc:#6366f1 -fill white -font Helvetica -pointsize 80 \
  -gravity center -draw "text 0,0 'C'" frontend/public/icons/icon-192.png
convert -size 512x512 xc:#6366f1 -fill white -font Helvetica -pointsize 200 \
  -gravity center -draw "text 0,0 'C'" frontend/public/icons/icon-512.png
```

ImageMagick이 없다면 임의의 192x192, 512x512 PNG 파일을 `frontend/public/icons/` 에 복사.

- [ ] **Step 3: `frontend/public/manifest.json` 작성 (vite.config.ts 의 VitePWA 가 이미 처리하지만 standalone 파일도 추가)**

```json
{
  "name": "WebSocket Chat",
  "short_name": "Chat",
  "description": "실시간 채팅 앱",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#6366f1",
  "background_color": "#ffffff",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 4: Render 배포 설정**

Render 대시보드에서:
- **Backend (Web Service):** `docker-compose` 대신 `backend/` 디렉토리를 루트로 Docker 배포
  - Build Command: `pip install -r requirements.txt`
  - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
  - 환경변수: `DATABASE_URL`, `SECRET_KEY`
- **Frontend (Static Site):**
  - Build Command: `npm ci && npm run build`
  - Publish Directory: `dist`
  - 환경변수: `VITE_API_URL`, `VITE_WS_URL`

- [ ] **Step 5: GitHub Actions 확인**

```bash
git add .github/ frontend/public/
git commit -m "chore: CI/CD (GitHub Actions) + PWA 설정"
git push origin main
```

GitHub → Actions 탭에서 워크플로 실행 확인

- [ ] **Step 6: 아이폰에서 PWA 테스트 (Render 배포 후)**

```
1. iPhone Safari에서 Render URL 접속
2. 하단 공유 버튼 → "홈 화면에 추가"
3. 앱 아이콘 생성 확인 → 탭해서 전체화면 실행 확인
```

---

## 완료 기준

- [ ] `docker-compose up` 으로 세 서비스(백엔드, 프론트, DB) 정상 실행
- [ ] 회원가입 → 로그인 → JWT 토큰 발급
- [ ] 채팅방 생성 및 멤버 초대
- [ ] DM 방 생성 (중복 없음)
- [ ] 실시간 메시지 전송 (두 브라우저 탭에서 테스트)
- [ ] 타이핑 인디케이터 표시
- [ ] 온라인/오프라인 상태 표시
- [ ] 읽음 확인 (`last_read_at` 업데이트)
- [ ] GitHub Actions CI 통과
- [ ] Render 배포 성공
- [ ] 아이폰 PWA 설치 성공

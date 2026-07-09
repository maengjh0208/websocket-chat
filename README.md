# websocket-chat

WebSocket 기반 실시간 채팅 애플리케이션 실습 프로젝트.

그룹 채팅방, DM, 타이핑 인디케이터, 온라인 상태 표시, 멤버 초대/나가기 기능을 구현했습니다.

## 기술 스택

| 영역 | 기술 |
|------|------|
| 백엔드 | FastAPI, SQLAlchemy (async), PostgreSQL, Redis, WebSocket |
| 프론트엔드 | React 18, TypeScript, Vite, Zustand, Axios |
| 인프라 | Docker Compose, Alembic |

## 주요 기능

- 회원가입 / 로그인 (JWT 인증)
- 그룹 채팅방 생성 및 멤버 초대/나가기
- DM (1:1 채팅)
- 실시간 메시지 (WebSocket)
- 타이핑 인디케이터
- 온라인 상태 표시 (Redis presence + heartbeat)

## 실행 방법

### 사전 준비

- Docker Desktop 설치

### 환경 변수 설정

**`backend/.env`**
```env
DATABASE_URL=postgresql+asyncpg://maengjh:Aa123456!@db:5432/chat
TEST_DATABASE_URL=postgresql+asyncpg://maengjh:Aa123456!@localhost:5432/test_chat
SECRET_KEY=hello-friend
ACCESS_TOKEN_EXPIRE_DAYS=7
REDIS_URL=redis://redis:6379
```

**`frontend/.env`**
```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

### 실행

```bash
docker compose up --build
```

| 서비스 | 주소 |
|--------|------|
| 프론트엔드 | http://localhost:5173 |
| 백엔드 API | http://localhost:8000 |
| API 문서 | http://localhost:8000/docs |

### 테스트

```bash
make backend-test
```

## 아키텍처

### 전체 시스템 구성

```mermaid
graph TB
    subgraph Browser
        FE[React + Zustand]
    end

    subgraph Backend
        API[FastAPI REST API]
        WS[WebSocket Endpoint]
        CM[ConnectionManager]
        PM[PresenceManager]
    end

    subgraph Storage
        PG[(PostgreSQL)]
        RD[(Redis)]
    end

    FE -->|HTTP REST| API
    FE -->|WebSocket| WS
    WS --> CM
    WS --> PM
    API --> PG
    CM --> PG
    PM --> RD
```

### 백엔드 레이어 구조

```mermaid
graph LR
    Router --> Service --> CRUD --> DB[(PostgreSQL)]
    Router -->|의존성 주입| Deps[deps.py]
    Deps -->|JWT 검증| Security[core/security.py]
```

### WebSocket 메시지 흐름

```mermaid
sequenceDiagram
    participant C1 as 클라이언트 A
    participant WS as WebSocket Endpoint
    participant CM as ConnectionManager
    participant DB as PostgreSQL
    participant C2 as 클라이언트 B

    C1->>WS: message.send { room_id, content }
    WS->>DB: 메시지 저장
    WS->>CM: broadcast_to_users(member_ids)
    CM->>C1: message.new
    CM->>C2: message.new
```

### 온라인 상태 (Presence) 흐름

```mermaid
sequenceDiagram
    participant C as 클라이언트
    participant WS as WebSocket Endpoint
    participant RD as Redis
    participant Peer as 다른 사용자

    C->>WS: WebSocket 연결
    WS->>RD: SET user:{id}:online TTL=5분
    WS->>Peer: presence.update { status: online }
    WS->>C: 현재 온라인 피어 스냅샷 전송

    loop 2분마다
        C->>WS: ping
        WS->>RD: TTL 갱신
        WS->>C: pong
    end

    C->>WS: 연결 종료
    WS->>RD: DEL user:{id}:online
    WS->>Peer: presence.update { status: offline }
```

### 디렉토리 구조

```
websocket-chat/
├── backend/
│   └── app/
│       ├── api/
│       │   ├── routes/       # REST 라우터 (auth, users, rooms)
│       │   └── websocket.py  # WebSocket 엔드포인트
│       ├── core/             # 설정, 예외, 보안, enum
│       ├── crud/             # DB 쿼리 레이어
│       ├── db/               # SQLAlchemy 모델, 세션
│       ├── domain/           # 도메인 엔티티 (dataclass)
│       ├── managers/         # ConnectionManager, PresenceManager
│       ├── schemas/          # Pydantic 요청/응답 스키마
│       └── services/         # 비즈니스 로직 레이어
└── frontend/
    └── src/
        ├── api/              # Axios 클라이언트
        ├── components/       # React 컴포넌트 (Auth, Chat)
        ├── hooks/            # useWebSocket
        ├── store/            # Zustand store (auth, chat)
        └── types/            # TypeScript 타입 정의
```

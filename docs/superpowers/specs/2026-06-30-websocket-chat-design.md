# WebSocket Chat — 설계 문서

**작성일:** 2026-06-30  
**상태:** 승인됨

---

## 1. 프로젝트 개요

WebSocket을 처음부터 학습하면서, 실무 팀 프로젝트 수준으로 꾸려가는 채팅 앱.  
DM + 채팅방을 지원하며, 점진적으로 기능을 고도화해 나간다.

---

## 2. 기술 스택

| 레이어 | 기술 |
|--------|------|
| 백엔드 | Python 3.12, FastAPI, asyncio |
| 프론트엔드 | React 18, TypeScript, Vite |
| 상태 관리 | Zustand |
| DB | PostgreSQL 16, SQLAlchemy 2 (async), Alembic |
| 인증 | JWT (python-jose), 추후 OAuth (Google) 확장 예정 |
| 컨테이너 | Docker, docker-compose |
| CI/CD | GitHub Actions → Render |
| PWA | vite-plugin-pwa (아이폰 홈 화면 설치 지원) |

---

## 3. 전체 아키텍처

```
websocket-chat/ (모노레포)

┌──────────────┐          ┌──────────────────────────┐
│  frontend/   │  HTTP /  │       backend/            │
│  React+Vite  │◄────────►│  FastAPI + asyncio        │
│  (port 5173) │  WS      │  (port 8000)              │
│  PWA 지원    │          │                           │
└──────────────┘          │  ┌──────────────────────┐ │
                          │  │ WebSocket             │ │
                          │  │ Connection Manager    │ │
                          │  └──────────────────────┘ │
                          │  ┌──────────────────────┐ │
                          │  │ REST API              │ │
                          │  │ (auth, history, rooms)│ │
                          │  └──────────────────────┘ │
                          └──────────┬────────────────┘
                                     │
                          ┌──────────▼────────────────┐
                          │  PostgreSQL (port 5432)    │
                          └───────────────────────────┘
```

**핵심 흐름:**
1. 브라우저 → REST API로 로그인 → JWT 발급
2. 브라우저 → `ws://서버/ws?token=...` 으로 WebSocket 연결 (토큰으로 인증)
3. 이후 모든 실시간 통신(메시지, 타이핑, 읽음확인, 온라인상태)은 WebSocket
4. 메시지는 PostgreSQL에 영구 저장, 히스토리 조회는 REST API

---

## 4. 디렉토리 구조

```
websocket-chat/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── auth.py          # 회원가입, 로그인 REST API
│   │   │   │   ├── rooms.py         # 채팅방 CRUD REST API
│   │   │   │   └── messages.py      # 메시지 히스토리 조회 REST API
│   │   │   └── websocket.py         # WebSocket 엔드포인트
│   │   ├── core/
│   │   │   ├── config.py            # 환경변수, 설정
│   │   │   └── security.py          # JWT 발급/검증
│   │   ├── db/
│   │   │   ├── models.py            # SQLAlchemy ORM 모델
│   │   │   └── session.py           # DB 연결, 세션
│   │   ├── managers/
│   │   │   └── connection.py        # WebSocket 연결 관리자 (핵심)
│   │   ├── schemas/
│   │   │   └── *.py                 # Pydantic 스키마
│   │   └── main.py                  # FastAPI 앱 진입점
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chat/                # 채팅창, 메시지 버블
│   │   │   ├── Sidebar/             # 채팅방 목록, DM 목록
│   │   │   └── Auth/                # 로그인, 회원가입 폼
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts      # WebSocket 연결 커스텀 훅
│   │   ├── store/                   # Zustand 전역 상태
│   │   └── main.tsx
│   ├── public/
│   │   ├── manifest.json            # PWA 앱 이름, 아이콘 정의
│   │   └── icons/                   # 홈 화면 아이콘 (여러 해상도)
│   ├── Dockerfile
│   ├── vite.config.ts               # vite-plugin-pwa 설정
│   └── package.json
│
├── docker-compose.yml               # 로컬 개발 환경
├── docker-compose.prod.yml          # 프로덕션 환경
├── .github/
│   └── workflows/
│       └── ci.yml                   # GitHub Actions CI/CD
└── docs/
    └── superpowers/specs/
        └── 2026-06-30-websocket-chat-design.md
```

---

## 5. DB 모델

```
User                    Room                    RoomMember
─────────────────       ─────────────────       ─────────────────
id (UUID, PK)           id (UUID, PK)           room_id (FK)
username (unique)       name                    user_id (FK)
email (unique)          is_dm (bool)            joined_at
hashed_password         created_by (FK→User)    last_read_at  ← 읽음확인
created_at              created_at

Message
─────────────────
id (UUID, PK)
room_id (FK→Room)
sender_id (FK→User)
content (text)
created_at
```

**설계 결정:** DM은 별도 테이블 없이 `Room(is_dm=True)`으로 통합.  
두 유저가 공유하는 방 하나를 DM 채널로 사용. 코드 단순화 + REST/WS API 통합 가능.

---

## 6. WebSocket 메시지 프로토콜

클라이언트↔서버가 주고받는 JSON 명세. 백/프론트 팀이 이 문서를 기준으로 독립 개발.

### 클라이언트 → 서버

```jsonc
// 메시지 전송
{ "type": "message.send", "room_id": "uuid", "content": "안녕!" }

// 타이핑 시작/종료
{ "type": "typing.start", "room_id": "uuid" }
{ "type": "typing.stop", "room_id": "uuid" }

// 읽음 확인
{ "type": "read.update", "room_id": "uuid" }
```

### 서버 → 클라이언트

```jsonc
// 새 메시지 브로드캐스트
{
  "type": "message.new",
  "id": "uuid",
  "room_id": "uuid",
  "sender": { "id": "uuid", "username": "juhee" },
  "content": "안녕!",
  "created_at": "2026-06-30T10:00:00Z"
}

// 타이핑 인디케이터
{ "type": "typing.indicator", "room_id": "uuid", "username": "juhee", "is_typing": true }

// 온라인 상태
{ "type": "presence.update", "user_id": "uuid", "status": "online" }

// 에러
{ "type": "error", "code": "UNAUTHORIZED", "message": "토큰이 유효하지 않습니다" }
```

---

## 7. 인증 흐름 (JWT)

```
클라이언트                          서버
    │── POST /auth/register ───────►│ 회원가입 (username, email, password)
    │── POST /auth/login ──────────►│ JWT access_token 발급 (만료: 7일)
    │◄─ { access_token: "eyJ..." } ─│
    │                               │
    │── GET /rooms ─────────────────►│ Authorization: Bearer eyJ...
    │                               │
    │── ws://.../ws?token=eyJ... ──►│ 쿼리 파라미터로 토큰 전달
    │                               │  → 서버에서 검증 후 연결 수락
    │◄══════ 실시간 통신 시작 ══════│
```

**WebSocket은 HTTP 헤더를 자유롭게 설정할 수 없으므로 쿼리 파라미터로 토큰 전달.**  
추후 OAuth(Google) 추가 시 `/auth/google` 엔드포인트만 추가하면 되도록 구조화.

---

## 8. 프론트엔드 화면 구성

```
┌─────────────────────────────────────────────────────┐
│  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │   Sidebar    │  │        ChatWindow             │ │
│  │              │  │                              │ │
│  │ [채팅방]     │  │  juhee: 안녕!       10:00   │ │
│  │  # general   │  │         안녕하세요~  10:01  │ │
│  │  # random    │  │  juhee: ㅎㅎ        10:02   │ │
│  │              │  │                              │ │
│  │ [DM]         │  │  ✏️ juhee가 입력 중...       │ │
│  │  @ alice     │  │                              │ │
│  │  @ bob  🟢   │  │ ┌──────────────────────────┐ │ │
│  │              │  │ │ 메시지 입력...        전송 │ │ │
│  │  ──────────  │  │ └──────────────────────────┘ │ │
│  │  🟢 juhee    │  └──────────────────────────────┘ │
│  └──────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

- 🟢 온라인 상태 표시
- `✏️ 입력 중...` 타이핑 인디케이터
- 메시지 옆 읽음 확인 (✓✓)

---

## 9. PWA (아이폰 설치 지원)

`vite-plugin-pwa`를 사용해 React 앱을 PWA로 구성.

**아이폰 설치 흐름:**
```
Render 배포 완료
  → Safari에서 URL 접속
  → 하단 공유 버튼 → "홈 화면에 추가"
  → 앱 아이콘 생성 → 탭하면 전체화면 실행
```

**iOS 제약:** 앱이 닫혀 있을 때 백그라운드 푸시 알림은 Web Push를 추가해야 함 (로드맵 6단계).

---

## 10. Docker & CI/CD

### 로컬 개발 (docker-compose.yml)
```yaml
services:
  backend:   # FastAPI (port 8000), 코드 변경 시 자동 재시작
  frontend:  # React+Vite (port 5173), HMR 지원
  db:        # PostgreSQL (port 5432)
```

`docker-compose up` 하나로 세 서비스 동시 실행.

### CI/CD (GitHub Actions → Render)
```
git push
  → GitHub Actions 실행
      ├── backend 테스트 (pytest)
      ├── frontend 빌드 체크
      └── 테스트 통과 시 → Render 자동 배포
```

---

## 11. 테스트 전략

| 레이어 | 도구 | 대상 |
|--------|------|------|
| 백엔드 단위 | pytest + pytest-asyncio | JWT 로직, DB 모델 |
| 백엔드 통합 | httpx + pytest | REST API 엔드포인트 |
| WebSocket | pytest + websockets | 연결, 메시지 브로드캐스트 |
| 프론트엔드 | Vitest | 커스텀 훅, 유틸 함수 |

---

## 12. 고도화 로드맵

```
1단계 (현재): WebSocket 기초 + DM/채팅방 + JWT 인증
2단계: 타이핑 인디케이터 + 온라인 상태 + 읽음 확인
3단계: PWA 설정 + Render 배포 + CI/CD → 아이폰에서 테스트
4단계: 파일/이미지 첨부, 이모지 반응, 메시지 수정/삭제
5단계: OAuth (Google), Redis pub/sub (수평 확장)
6단계: Web Push 알림 (백그라운드 알림)
```

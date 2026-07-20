# Render 배포 계획

## 목표

로컬 docker-compose 환경을 Render에 배포해 외부에서 접근 가능하게 한다.  
CI/CD는 GitHub Actions, DB는 Neon, Redis는 Upstash 사용.

## 최종 구조

```
GitHub (main push)
  → GitHub Actions (테스트 → 빌드 → Render 배포 트리거)

Render Web Service     — FastAPI 백엔드 (Docker)
  ↔ Neon PostgreSQL   — 관리형 PostgreSQL (영구 무료 1GB)
  ↔ Upstash Redis     — 관리형 Redis, TLS (무료 일 10k req)

Render Static Site     — React 프론트엔드 (빌드 결과물)

UptimeRobot            — /health 15분마다 핑 (슬립 방지)
```

## 외부 서비스

| 서비스 | 용도 | 플랜 | 비고 |
|--------|------|------|------|
| [Neon](https://neon.tech) | PostgreSQL | 무료 (1GB) | Region: Singapore or Tokyo |
| [Upstash](https://upstash.com) | Redis Pub/Sub | 무료 (일 10k req) | TLS 필수, `rediss://` URL |
| [Render](https://render.com) | 백엔드 + 프론트 호스팅 | 무료 (슬립 있음) | Web Service + Static Site |
| [UptimeRobot](https://uptimerobot.com) | 슬립 방지 핑 | 무료 | 15분 간격 |

## 진행 단계

### Phase 1 — 외부 서비스 준비 ✅ (진행 중)
- [ ] Neon 가입 → 프로젝트 생성 → Connection string 확보
- [ ] Upstash 가입 → Redis 인스턴스 생성 → Redis URL 확보 (`rediss://`)

### Phase 2 — 코드 수정
- [ ] `frontend/Dockerfile` — dev 서버 대신 `npm run build` + nginx 정적 서빙으로 변경
- [ ] `backend/.env.example` 생성 — 실제 값 없이 키 목록만 (DB_URL, REDIS_URL 등)
- [ ] 백엔드 DB URL에 `?sslmode=require` 지원 확인 (Neon 필수)

### Phase 3 — Render 서비스 등록
- [ ] Render 가입 (GitHub 연동)
- [ ] **Web Service** 생성
  - Source: GitHub 연동
  - Environment: Docker
  - Dockerfile path: `backend/Dockerfile`
  - 환경변수: DB_URL (Neon), REDIS_URL (Upstash), SECRET_KEY 등
- [ ] **Static Site** 생성
  - Build command: `cd frontend && npm install && npm run build`
  - Publish directory: `frontend/dist`
  - 환경변수: `VITE_API_URL` (백엔드 Render URL)

### Phase 4 — GitHub Actions CI/CD
- [ ] `.github/workflows/deploy.yml` 작성
  - `main` 브랜치 push 시 트리거
  - 백엔드 pytest 실행
  - 성공 시 Render Deploy Hook 호출 (백엔드, 프론트 각각)
- [ ] Render Deploy Hook URL을 GitHub Secrets에 등록
  - `RENDER_BACKEND_DEPLOY_HOOK`
  - `RENDER_FRONTEND_DEPLOY_HOOK`

### Phase 5 — 슬립 방지
- [ ] [UptimeRobot](https://uptimerobot.com) 가입
- [ ] HTTP(S) 모니터 추가
  - URL: `https://<backend>.onrender.com/health`
  - 간격: 5분 (무료 최소값)

## 환경변수 목록

### 백엔드 (Render Web Service)

```
DATABASE_URL=postgresql+asyncpg://...@...neon.tech/chat?sslmode=require
REDIS_URL=rediss://default:...@....upstash.io:6379
SECRET_KEY=<랜덤 32바이트 hex>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

### 프론트엔드 (Render Static Site)

```
VITE_API_URL=https://<backend-service-name>.onrender.com
VITE_WS_URL=wss://<backend-service-name>.onrender.com
```

## 주의사항

- Render 무료 Web Service는 15분 비활성 시 슬립 → UptimeRobot으로 해결
- Upstash Redis URL은 `rediss://` (TLS) 사용, `redis://` 아님
- Neon connection string에 반드시 `?sslmode=require` 포함
- WebSocket은 Render에서 `wss://` (TLS)로만 동작 (프론트 WS URL 수정 필요)
- `docker-compose.yml`은 로컬 개발용으로 유지, Render 배포와 별개

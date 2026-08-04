## 개발 철학

- 당장의 실익보다 **팀 규모와 장기 유지보수**를 기준으로 방법을 선택한다
- "지금은 혼자니까 간단하게"가 아니라 "팀이 합류했을 때 자연스럽게 확장되는가"를 기준으로 판단
- 더 복잡하더라도 유지보수성이 높은 방법을 채택하고, 그 이유를 설명한다
- 깨진 창문을 내버려두지 마라. 더 이상의 손상을 예방하기 위해 어떤 조치든 취하고 현 상황을 잘 관리하고 있다는 것을 보여줘라.

## 코드 작성 원칙

### 공통

코드나 설정을 제시할 때는 반드시 **코드 + 상세 설명**을 함께 제공한다.

- 각 줄 또는 블록이 왜 필요한지, 어떻게 동작하는지 설명
- "이렇게 쓰면 된다"가 아니라 "이렇게 쓰는 이유"까지 포함

### 백엔드 실습 진행 방식

- 코드와 설정 파일을 대신 작성하지 말 것
- 설명과 가이드만 제공하고, 실제 작성은 사용자가 직접 함
- 사용자가 작성 완료 후 요청 시 리뷰와 피드백 제공 가능

### 프론트엔드

Claude가 코드를 직접 작성해도 됨.
단, WebSocket과 연결되는 부분(useWebSocket 훅, 메시지 핸들러 등)은 반드시 설명 포함.

## WebSocket 개념 설명 규칙

WebSocket 관련 코드나 개념이 나올 때마다:

- HTTP와 WebSocket의 차이를 실제 사례로 비유
- 연결(handshake) → 유지 → 해제 생명주기를 항상 언급
- "왜 HTTP REST API가 아닌 WebSocket을 쓰는가"를 반복해서 상기시킬 것

## 환경변수 관리 규칙

환경별로 파일을 분리한다.

```
backend(또는 frontend)/
  .env.local     # 로컬 개발용 비밀값 → gitignore (절대 커밋 금지)
  .env.prod      # 프로덕션 참고용 → gitignore (실제 배포값은 Render 대시보드에서 직접 입력)
```

- 프로덕션 값은 파일로 관리하지 않고 Render 대시보드에서 직접 입력
- `pydantic-settings`: `env_file = '.env.local'`
- `docker-compose`: `env_file: [./backend/.env.local]`

## 진행 상황

Task 3~16 모두 완료. 계획된 구현 끝.

- 아키텍처: Router → Service → CRUD → Domain Entity 레이어
- 인프라: Nginx + Redis Pub/Sub으로 다중 서버 WebSocket 지원
- 상세 계획 문서: `docs/superpowers/plans/2026-07-11-advanced-features.md`

### 성능/안정성 보강 (2026-07-28~)

세 가지를 독립 작업으로 나눠서 순서대로 진행 중: 재연결 → Rate limiting → 부하 테스트.

- [x] **WebSocket 자동 재연결 (지수 백오프 + heartbeat)** — 코드 작업 완료, 최종 수동 통합 테스트만 미확인
  - 스펙: `docs/superpowers/specs/2026-07-28-ws-reconnect-design.md`
  - 계획: `docs/superpowers/plans/2026-07-28-ws-reconnect.md`
  - Render 배포 테스트 중 발견된 후속 문제(멀티탭 연결 덮어쓰기, heartbeat 1회 실패 시 즉시 재연결, 재연결 시 안읽음 카운트 미복구)는 별도 스펙/계획으로 수정 완료:
    - 스펙: `docs/superpowers/specs/2026-07-28-ws-connection-hardening-design.md`
    - 계획: `docs/superpowers/plans/2026-07-28-ws-connection-hardening.md` (코드 작업 완료, 최종 수동 통합 테스트만 미확인)
- [x] **Rate limiting (slowapi)** — 완료 (REST 전역 60/min, 로그인·회원가입 10/min, WS message.send 10/10초). 자동화 테스트, 멀티 서버 시나리오, 수동 브라우저 테스트(로그인 폼/채팅 메시지 연타 + 에러 메시지·토스트 노출)까지 전부 확인 완료
  - 스펙: `docs/superpowers/specs/2026-07-29-rate-limiting-design.md`
  - 계획: `docs/superpowers/plans/2026-07-29-rate-limiting.md`
  - **해결된 이슈 (2026-08-03)**: `nginx.conf`가 `upstream backend { server backend:8000; }`로 `backend` 호스트명을 시작 시점에 한 번만 해석해서 캐싱하는 바람에, nginx가 이미 떠 있는 상태에서 `docker compose up --scale backend=N`으로 나중에 컨테이너를 늘리면 새 컨테이너가 트래픽을 못 받는 문제가 있었음 (도커 브릿지 네트워크의 IP 재사용 때문에 우연히 동작하는 것처럼 보인 경우도 있었으나 근본적으로는 신뢰 불가였음). `upstream` 블록을 없애고 `resolver 127.0.0.11 valid=10s;` + `set $backend_upstream backend:8000;` 변수 기반 `proxy_pass`로 교체해서, nginx 재시작 없이도 최대 10초 이내에 최신 backend 목록을 반영하도록 수정 완료. nginx를 건드리지 않은 채 backend를 3개로 스케일해서 새로 뜬 컨테이너(재사용 아닌 완전히 새 IP)가 실제로 트래픽을 받는 것까지 확인함.
- [ ] **Locust 부하 테스트** — 예정, rate limiting 완료 후 브레인스토밍 시작

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
  - **알려진 이슈 (범위 밖, 후속 작업 필요, 2026-08-03 재검증 후 내용 정정)**: `nginx.conf`의 `upstream backend { server backend:8000; }`는 nginx가 시작될 때 `backend` 호스트명을 DNS로 딱 한 번만 해석해서 캐싱하고, 이후로는 재해석하지 않는다. 다만 실제로 문제가 드러나는 조건은 처음 문서화했을 때보다 좁다:
    - `docker compose up --scale backend=N`처럼 **backend 컨테이너들이 먼저 뜨고 nginx가 그 다음에 시작**하는 경우 (nginx가 `depends_on: backend`), nginx가 시작 시점에 DNS를 조회하면 이미 존재하는 N개 컨테이너의 IP를 전부 받아와서 정상적으로 로드밸런싱함 — 직접 `/health`에 10회 요청 후 두 컨테이너 로그를 대조해 5:5 분산, nginx 컨테이너 내부 `ss -tn`으로 두 IP 모두에 연결돼 있음을 확인함
    - 문제는 **nginx가 이미 떠 있는 상태에서 나중에 backend를 스케일하거나 컨테이너를 재생성**할 때 발생함. 이때 nginx는 재해석을 하지 않으므로 예전에 캐싱해둔 IP만 계속 사용함. 재현 시도 중, 도커 브릿지 네트워크의 좁은 IP 풀(172.18.0.x)이 해제된 IP를 순서대로 재사용하는 바람에 새로 뜬 컨테이너가 우연히 nginx가 캐싱해둔 IP를 그대로 이어받아 로드밸런싱이 계속 되는 것처럼 보이는 경우도 있었음 (`docker inspect`로 IP 재사용 확인) — 즉 이 조건에서 정상 동작하는 것처럼 보여도 IP 재사용이라는 우연에 기대고 있는 것이라 신뢰할 수 없음. 컨테이너가 많아지거나 IP 풀이 커지면 새 컨테이너가 완전히 새로운 IP를 받아 트래픽을 전혀 못 받는 상황이 재현될 수 있음
    - 고치려면 `resolver 127.0.0.11 valid=10s;` + 변수 기반 `proxy_pass`로 매 요청(또는 주기적)마다 DNS를 재해석하게 만들어야 함 — 이 결론 자체는 여전히 유효함
    - 재연결/멀티탭 작업 때도 이 부분은 검증 범위에 없었던 것으로 보임
- [ ] **Locust 부하 테스트** — 예정, rate limiting 완료 후 브레인스토밍 시작

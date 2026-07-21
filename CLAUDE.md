## 개발 철학

- 당장의 실익보다 **팀 규모와 장기 유지보수**를 기준으로 방법을 선택한다
- "지금은 혼자니까 간단하게"가 아니라 "팀이 합류했을 때 자연스럽게 확장되는가"를 기준으로 판단
- 더 복잡하더라도 유지보수성이 높은 방법을 채택하고, 그 이유를 설명한다

## 코드 작성 원칙

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

팀 규모를 가정한 환경변수 파일 분리 패턴을 사용한다.

```
backend(또는 frontend)/
  .env.common    # 환경 무관 공통값, 비밀 없음 → 커밋
  .env.local     # 로컬 전용 비밀값 → gitignore (절대 커밋 금지)
  .env.example   # 전체 키 목록 + 설명 → 커밋 (신규 팀원 온보딩용)
```

- 프로덕션 값은 파일로 관리하지 않고 Render 대시보드에서 직접 입력
- `.env.local`이 `.env.common`의 같은 키를 덮어쓰는 방식 (나중 파일 우선)
- `pydantic-settings`: `env_file = ('.env.common', '.env.local')`
- `docker-compose`: `env_file: [.env.common, .env.local]`
- 신규 팀원 온보딩: `.env.example` 보고 `.env.local` 채우기

## 진행 상황

Task 3~16 모두 완료. 계획된 구현 끝.

- 아키텍처: Router → Service → CRUD → Domain Entity 레이어
- 인프라: Nginx + Redis Pub/Sub으로 다중 서버 WebSocket 지원
- 상세 계획 문서: `docs/superpowers/plans/2026-07-11-advanced-features.md`

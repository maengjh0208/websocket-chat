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

## 진행 상황

- 다음 시작 지점: Task 4 — 채팅방 API (`backend/app/api/routes/rooms.py`)
- Task 3 완료: JWT 인증 (register/login), 통합 테스트 5케이스 통과
- 추가 완료 (원래 계획 외): `core/exceptions.py`, `core/error_handlers.py`, `app/domain/user.py`, `app/crud/user.py`, `app/services/auth.py`
- 아키텍처: Router → Service → CRUD → Domain Entity 레이어 구조로 구현
- deps.py는 커스텀 예외 + UserEntity 기반으로 리팩토링 완료
- 테스트: `tests/integration/` 디렉토리 구조, conftest.py는 `tests/` 루트에 위치
- 설계 문서: `docs/superpowers/specs/2026-06-30-websocket-chat-design.md`
- 구현 계획 (상세 체크박스): `docs/superpowers/plans/2026-06-30-websocket-chat.md`
- 새 대화에서 재개 시 위 문서의 구현 계획 문서를 먼저 확인할 것

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

- 다음 시작 지점: Task 15 프론트엔드 — 친구 목록 UI (types/index.ts, store/friend.ts, Sidebar.tsx)
- Task 15 백엔드 완료: 친구 목록 기능
  - `domain/friend.py`: FriendEntity, FriendRequestEntity
  - `core/enums.py`: FriendStatus 추가
  - `core/exceptions.py`: INVALID_REQUEST, FRIEND_REQUEST_EXISTS, FRIEND_REQUEST_NOT_FOUND, FRIEND_NOT_FOUND 추가
  - `db/models.py`: Friend 모델 추가 + Alembic migration 완료
  - `crud/friend.py`: get_request, send_request, get_received_requests(JOIN), accept_request, get_friend_ids, delete_friend
  - `crud/user.py`: get_users_by_ids 추가
  - `managers/presence.py`: get_online_peer_ids 반환 타입 dict[UUID, bool]로 변경
  - `services/friend.py`: send_request, get_received_requests, accept_request, get_friends, delete_friend
  - `schemas/friend.py`: FriendRequest, FriendRequestResponse(from_attributes=True), FriendResponse
  - `api/routes/friends.py`: 5개 엔드포인트, main.py에 등록 완료
- Task 14 완료: Presence 개선
  - `redis.py`: decode_responses=True 추가
  - `presence.py`: get_all_online_ids() (scan_iter), get_online_peer_ids() (dict[UUID, bool] 반환)
  - `websocket.py`: _broadcast_presence → 전체 온라인 유저 대상으로 변경, session 의존성 제거
  - `Sidebar.tsx`: 유저 목록 온라인 유저만 표시
- Task 12 완료: 프론트엔드 실시간 기능 통합
  - `CreateRoomModal`: 채팅방 만들기 / DM 시작 탭 모달
  - `Sidebar`: + 버튼으로 모달 열기, 방 아이콘 (#/👤), 내 온라인 상태 점 표시
  - `ChatLayout`: activeRoomId를 로컬 state → Zustand store로 통합
  - 두 브라우저(일반 + 시크릿)로 DM 실시간 채팅 테스트 완료
- Task 11 완료: 프론트엔드 Chat UI
  - `Sidebar`, `ChatWindow`, `MessageBubble`, `MessageInput`, `TypingIndicator`, `ChatLayout` 컴포넌트
  - 실시간 메시지 미표시 버그 수정: useWebSocket onmessage에서 getState() 사용
  - 새로고침 시 자동 로그아웃 버그 수정: initUser() 추가
- Task 10 완료: useWebSocket 훅 (`frontend/src/hooks/useWebSocket.ts`)
  - token을 쿼리 파라미터로 WebSocket 연결
  - onmessage: message.new → addMessage, typing.indicator → setTyping, presence.update → setOnline
  - sendMessage, sendTypingStart, sendTypingStop, sendReadUpdate 헬퍼 반환
- Task 9 완료: 프론트엔드 Auth UI
  - `LoginForm`, `RegisterForm` 컴포넌트
  - `GET /users/me` 백엔드 엔드포인트 추가
- Task 8 완료: 프론트엔드 기반 설정
  - package.json, tsconfig.json, vite.config.ts, index.html
  - `src/types/index.ts`, `src/api/client.ts` (axios + auth 인터셉터)
  - `src/store/auth.ts` (useAuthStore), `src/store/chat.ts` (useChatStore)
- Task 7 완료: WebSocket 실시간 기능
  - `core/enums.py`: TYPING_START, TYPING_STOP, TYPING_INDICATOR, READ_UPDATE ENUM 추가
  - `crud/room.py`: update_last_read_at 추가 (UPDATE WHERE 단일 쿼리, rowcount 반환)
  - `db/session.py`: get_session() asynccontextmanager 추가, get_db()가 재사용하도록 리팩터
  - `api/websocket.py`: 메시지마다 get_session() 사용으로 DB 커넥션 풀 효율화, typing/read 핸들러 추가
  - Postman으로 수동 테스트 완료 (typing.start 발신 확인)
- Task 3 완료: JWT 인증 (register/login), 통합 테스트 5케이스 통과
- Task 4 완료: REST API (Users, Rooms, Messages), 통합 테스트 9케이스 통과
  - `domain/`: user, room, message 엔티티
  - `crud/`: user, room (is_room_member 포함), message (JOIN + label)
  - `services/`: auth, users, room, message (멤버 검증 포함)
  - `api/routes/`: auth, users, rooms (GET /rooms, POST /rooms, POST /rooms/dm, GET /rooms/{id}/messages)
  - `tests/integration/`: test_auth.py (5개), test_rooms.py (4개)
  - `tests/integration/helpers.py`: auth_headers, register_and_get_token 헬퍼
- Task 5 완료: WebSocket ConnectionManager (`backend/app/managers/connection.py`)
  - connect, disconnect, is_online, send_to_user, broadcast_to_users 구현
  - `tests/unit/test_websocket.py`: 단위 테스트 4케이스 통과
- Task 6 완료: WebSocket 엔드포인트 (`backend/app/api/websocket.py`)
  - JWT 인증 → 연결 수락 → 메시지 수신 루프 → DB 저장 → 브로드캐스트
  - presence 브로드캐스트 (_broadcast_presence: 공통 방 멤버에게 online/offline 알림)
  - `crud/room.py`: get_room_member_ids, get_peer_user_ids 추가
  - `crud/message.py`: create_message 추가 (message.id, created_at 반환)
  - `core/enums.py`: WSCloseCode, PresenceStatus, WSMessageType ENUM 추가
  - Postman으로 수동 테스트 완료 (message.new 수신 확인)
- 추가 완료 (원래 계획 외): `core/exceptions.py`, `core/error_handlers.py`, `core/enums.py`
- 아키텍처: Router → Service → CRUD → Domain Entity 레이어 구조로 구현
- Pydantic 스키마는 model_config 없이 사용 (CRUD에서 dataclass로 변환 후 전달하므로 from_attributes 불필요)
- 테스트: `tests/integration/` (통합), `tests/unit/` (단위) 디렉토리 구조, conftest.py는 `tests/` 루트에 위치, 로컬에서 `make backend-test` 로 실행
- 설계 문서: `docs/superpowers/specs/2026-06-30-websocket-chat-design.md`
- 구현 계획 (상세 체크박스): `docs/superpowers/plans/2026-06-30-websocket-chat.md`
- 새 대화에서 재개 시 위 문서의 구현 계획 문서를 먼저 확인할 것

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

## 진행 상황 (새 대화 시작 시 여기서 확인)

> **규칙:** Task가 완료되면 아래 체크박스를 체크하고, "마지막 작업" 줄을 업데이트한다.
> 상세 진행 상황(단계별 체크박스)은 구현 계획 파일에서 확인.

**마지막 작업:** Task 1 완료 — Task 2 시작 필요

### Task 진행 현황

- [x] Task 1: 프로젝트 인프라 (docker-compose + Dockerfiles + 폴더 구조)
- [ ] Task 2: 백엔드 DB 모델 + FastAPI 앱 진입점
- [ ] Task 3: JWT 인증 (회원가입 / 로그인)
- [ ] Task 4: REST API — Users, Rooms, Messages
- [ ] Task 5: WebSocket 연결 관리자 (ConnectionManager)
- [ ] Task 6: WebSocket 엔드포인트 (메시지 전송)
- [ ] Task 7: WebSocket 실시간 기능 (타이핑, 온라인 상태, 읽음 확인)
- [ ] Task 8: 프론트엔드 기반 설정 (React + Vite + TypeScript + Zustand)
- [ ] Task 9: 프론트엔드 Auth UI (로그인 / 회원가입)
- [ ] Task 10: useWebSocket 훅
- [ ] Task 11: 프론트엔드 앱 셸 (사이드바 + 채팅 레이아웃)
- [ ] Task 12: 프론트엔드 채팅 UI
- [ ] Task 13: CI/CD (GitHub Actions) + PWA 아이콘

## 프로젝트 구조

설계 문서: `docs/superpowers/specs/2026-06-30-websocket-chat-design.md`
구현 계획 (상세 체크박스): `docs/superpowers/plans/2026-06-30-websocket-chat.md`

## 고도화 로드맵

1단계 (현재): WebSocket 기초 + DM/채팅방 + JWT 인증
2단계: 타이핑 인디케이터 + 온라인 상태 + 읽음 확인
3단계: PWA 설정 + Render 배포 + CI/CD → 아이폰 테스트
4단계: 파일/이미지 첨부, 이모지 반응, 메시지 수정/삭제
5단계: OAuth (Google), Redis pub/sub
6단계: Web Push 알림

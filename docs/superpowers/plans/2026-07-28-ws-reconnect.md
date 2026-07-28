# WebSocket 자동 재연결 (Exponential Backoff) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WebSocket 연결이 끊기면 지수 백오프로 자동 재연결하고, 소켓이 열려 있지만 실제로는 죽은 상태(heartbeat 타임아웃)도 감지해서 재연결하며, 사용자에게 배너로 상태를 알리고 재연결 후 메시지를 최신화한다.

**Architecture:** `frontend/src/hooks/useWebSocket.ts`의 연결 로직을 재귀 호출 가능한 `connect()` 함수로 추출하고, `onclose`와 heartbeat 타임아웃 양쪽에서 동일한 재연결 스케줄링 경로를 타도록 만든다. 재연결 여부는 훅이 반환하는 `connectionStatus`로 `ChatLayout.tsx`에 노출해 배너를 렌더링한다.

**Tech Stack:** React 18, TypeScript, 순수 WebSocket API (외부 재연결 라이브러리 없음)

## Global Constraints

- 이 플랜은 프론트엔드 전용이다. 백엔드 코드는 Claude가 직접 작성하지 않는다 (`CLAUDE.md`) — Task 3에 포함된 백엔드 확인 사항은 사용자가 직접 확인/수정한다.
- 자동화 테스트 프레임워크가 프론트엔드에 설치되어 있지 않다 (`frontend/package.json`에 vitest/jest 없음). 각 태스크의 검증은 `npx tsc --noEmit`(타입 체크)과 `npm run build`로 하고, 최종 동작 확인은 브라우저 수동 테스트로 한다.
- 백오프 파라미터: `baseDelay=1000ms`, `factor=2`, `maxDelay=30000ms`, ±20% 지터, 무한 재시도(횟수 제한 없음).
- Heartbeat 파라미터: 30초마다 ping 전송, pong 미수신 시 10초 후 타임아웃.

---

### Task 1: `pong` 메시지 타입 추가

**Files:**
- Modify: `frontend/src/types/index.ts:90-105`

**Interfaces:**
- Produces: `WSPong` 타입 (`{ type: 'pong' }`), `WSPayload` 유니온에 포함됨. Task 4에서 `useWebSocket.ts`가 `payload.type === 'pong'` 분기에 사용.

현재 프론트는 서버가 보내는 `{"type": "pong"}` 응답을 아예 타입으로 정의하지 않고 있다(현재 `onmessage`도 이 타입을 처리하지 않음 — Task 4에서 처리 추가). 먼저 타입만 추가한다.

- [x] **Step 1: `WSPong` 인터페이스 추가**

`frontend/src/types/index.ts`의 `WSReactionUpdate` 정의(라인 90-95) 바로 아래에 추가:

```ts
export interface WSPong {
  type: 'pong'
}
```

- [x] **Step 2: `WSPayload` 유니온에 포함**

```ts
export type WSPayload =
  | WSMessageNew
  | WSPresenceUpdate
  | WSTypingIndicator
  | WSFriendRequest
  | WSFriendAccept
  | WSFriendDelete
  | WSRoomInvite
  | WSReactionUpdate
  | WSPong
```

- [x] **Step 3: 타입 체크로 검증**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음 (아직 `pong`을 쓰는 곳이 없으므로 unused 경고도 없음)

- [x] **Step 4: 커밋**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: frontend - WSPong 타입 추가"
```

---

### Task 2: `connect()` 함수 추출 + 지수 백오프 재연결

**Files:**
- Modify: `frontend/src/hooks/useWebSocket.ts` (전체 재작성)

**Interfaces:**
- Consumes: 없음 (기존 훅 시그니처 `useWebSocket(token: string | null)` 유지)
- Produces: 내부 `connect()` 함수, `retryCountRef`, `reconnectTimeoutRef` — Task 3(heartbeat)과 Task 4(connectionStatus)가 같은 `useEffect` 블록 안에서 이 함수와 ref들을 계속 확장해 나간다.

기존에는 `useEffect` 안에서 `new WebSocket(...)`을 한 번만 호출했다. 이번 태스크에서 그 부분을 `connect()`라는 이름의 함수로 감싸서, `onclose`에서 백오프 지연 후 `connect()`를 다시 호출할 수 있게 만든다. Heartbeat는 다음 태스크에서 추가하므로 이번 단계에서는 아직 없다.

- [ ] **Step 1: `useWebSocket.ts` 전체를 아래 내용으로 교체**

```ts
import { useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '@/store/chat'
import { useFriendStore } from '@/store/friend'
import type { WSPayload } from '@/types'

const WS_URL = import.meta.env.VITE_WS_URL

// 지수 백오프 파라미터 — 1s → 2s → 4s → 8s → 16s → 30s(cap) 이후 무한 반복.
// 지터(±20%)는 여러 클라이언트가 동시에 끊겼다가 동시에 재연결을 시도해
// 서버에 요청이 몰리는 상황(thundering herd)을 완화하기 위한 것.
const BASE_DELAY_MS = 1000
const BACKOFF_FACTOR = 2
const MAX_DELAY_MS = 30000

function getBackoffDelay(retryCount: number): number {
  const raw = Math.min(BASE_DELAY_MS * BACKOFF_FACTOR ** retryCount, MAX_DELAY_MS)
  const jitter = 0.8 + Math.random() * 0.4
  return raw * jitter
}

export function useWebSocket(token: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const retryCountRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!token) return

    // 언마운트/token 변경(로그아웃 등) 이후에는 예약된 재연결이 실행되면 안 되므로 플래그로 막는다.
    let cancelled = false

    const connect = () => {
      if (cancelled) return

      // handshake: HTTP → WebSocket 업그레이드 요청
      // JWT를 쿼리 파라미터로 전달 (WebSocket은 커스텀 헤더를 자유롭게 설정할 수 없음)
      const ws = new WebSocket(`${WS_URL}/ws?token=${token}`)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[WS] 연결됨')
        retryCountRef.current = 0
      }

      // 서버에서 메시지가 push될 때마다 실행
      // onmessage는 React 렌더링 사이클 밖에서 실행되므로
      // useChatStore()가 아닌 getState()로 최신 액션을 가져옴
      ws.onmessage = (event: MessageEvent) => {
        let payload: WSPayload
        try {
          payload = JSON.parse(event.data) as WSPayload
        } catch {
          return
        }

        const {
          addMessage,
          setTyping,
          setOnline,
          fetchRooms,
          fetchDmRooms,
          incrementUnread,
          activeRoomId,
          updateReactions,
        } = useChatStore.getState()
        const { fetchPendingRequests, fetchFriends, removeFriend } = useFriendStore.getState()

        if (payload.type === 'message.new') {
          addMessage({
            id: payload.id,
            room_id: payload.room_id,
            sender: payload.sender,
            content: payload.content,
            created_at: payload.created_at,
            reactions: [],
          })
          // 지금 열어보고 있는 방이 아니면 안읽음 뱃지 +1.
          if (payload.room_id !== activeRoomId) {
            incrementUnread(payload.room_id)
          }
        } else if (payload.type === 'typing.indicator') {
          setTyping(payload.room_id, payload.username, payload.is_typing)
        } else if (payload.type === 'presence.update') {
          setOnline(payload.user_id, payload.status)
        } else if (payload.type === 'friend.request') {
          fetchPendingRequests()
        } else if (payload.type === 'friend.accept') {
          fetchFriends()
        } else if (payload.type === 'friend.delete') {
          removeFriend(payload.user_id)
        } else if (payload.type === 'room.invite') {
          if (payload.is_dm) {
            fetchDmRooms()
          } else {
            fetchRooms()
          }
        } else if (payload.type === 'reaction.update') {
          updateReactions(payload.room_id, payload.message_id, payload.reactions)
        }
      }

      ws.onclose = () => {
        console.log('[WS] 연결 종료')
        if (cancelled) return

        const delay = getBackoffDelay(retryCountRef.current)
        retryCountRef.current += 1
        console.log(`[WS] ${Math.round(delay)}ms 후 재연결 시도 (${retryCountRef.current}번째)`)
        reconnectTimeoutRef.current = setTimeout(connect, delay)
      }

      ws.onerror = (e) => {
        console.error('[WS] 에러', e)
      }
    }

    connect()

    // 언마운트/token 변경 시 예약된 재연결 타이머를 반드시 정리한다.
    // 정리하지 않으면 로그아웃 후에도 백그라운드에서 재연결 시도가 계속 발생할 수 있다.
    return () => {
      cancelled = true
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      wsRef.current?.close()
    }
  }, [token])

  const sendMessage = useCallback((roomId: string, content: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'message.send', room_id: roomId, content }))
  }, [])

  const sendTypingStart = useCallback((roomId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'typing.start', room_id: roomId }))
  }, [])

  const sendTypingStop = useCallback((roomId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'typing.stop', room_id: roomId }))
  }, [])

  const sendReadUpdate = useCallback((roomId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'read.update', room_id: roomId }))
  }, [])

  const sendReaction = useCallback((messageId: string, emoji: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'reaction.toggle', message_id: messageId, emoji }))
  }, [])

  return { sendMessage, sendTypingStart, sendTypingStop, sendReadUpdate, sendReaction }
}
```

- [ ] **Step 2: 타입 체크로 검증**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 브라우저에서 수동 확인**

`docker compose up`으로 스택 실행 후 브라우저에서 로그인 → 개발자도구 콘솔에 `[WS] 연결됨` 로그 확인. 그 다음 `docker compose restart backend`로 백엔드를 재시작해 연결을 강제로 끊고, 콘솔에 `[WS] 연결 종료` → `[WS] Nms 후 재연결 시도 (1번째)` 로그가 뜨고 잠시 후 다시 `[WS] 연결됨`이 뜨는지 확인. 지연 시간이 재시도할 때마다 1s→2s→4s...로 늘어나는지도 확인(백엔드가 계속 꺼져 있는 상태로 여러 번 재시도되게 두면 확인 가능).

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/hooks/useWebSocket.ts
git commit -m "feat: frontend - WebSocket 지수 백오프 자동 재연결"
```

---

### Task 3: Heartbeat (ping/pong 타임아웃) 추가

**Files:**
- Modify: `frontend/src/hooks/useWebSocket.ts`

**Interfaces:**
- Consumes: Task 2에서 만든 `connect()` 함수, `ws.onclose` 재연결 스케줄링 경로
- Produces: `pingIntervalRef`, `pongTimeoutRef`, `startHeartbeat()`/`stopHeartbeat()` 헬퍼. Task 4에서 `onopen`/`onclose`가 이 헬퍼들을 계속 사용한다.

**사전 확인 (백엔드, 사용자 직접 확인):** 기존 ping 주기가 2분이었던 건 백엔드 presence TTL 갱신이 목적이었다. 이번에 30초로 줄이면서 presence TTL이 30초보다 충분히 여유 있게 설정되어 있는지(예: 60초 이상) 백엔드 코드(`backend/app/managers/presence.py` 등 TTL 설정 부분)를 확인해달라 — TTL이 너무 짧으면 ping 주기를 줄인 것과 무관하게 온라인 상태가 자꾸 깜빡일 수 있다. 이 확인/수정은 백엔드 코드라 Claude가 직접 하지 않는다.

브라우저 네이티브 WebSocket은 서버가 명시적으로 끊거나 TCP 레벨 에러가 나야 `onclose`가 발생한다. 노트북 슬립 후 깨어남처럼 "소켓은 열려 있지만 실제로는 죽은" 상태는 감지되지 않는다. 이를 잡기 위해 30초마다 ping을 보내고, 10초 안에 pong이 안 오면 `ws.close()`를 직접 호출해 죽은 연결을 강제로 닫는다 — `ws.close()`를 호출하면 브라우저가 `onclose`를 발생시키므로, Task 2에서 만든 재연결 스케줄링 경로를 그대로 재사용한다(중복 작성 불필요).

- [ ] **Step 1: 파라미터 상수 추가**

`BACKOFF_FACTOR`/`MAX_DELAY_MS` 상수 정의 바로 아래(파일 상단)에 추가:

```ts
// heartbeat — 30초마다 ping, 10초 안에 pong 없으면 죽은 연결로 간주
const PING_INTERVAL_MS = 30 * 1000
const PONG_TIMEOUT_MS = 10 * 1000
```

- [ ] **Step 2: `useWebSocket` 함수 내부에 heartbeat용 ref 추가**

`reconnectTimeoutRef` 선언 바로 아래에 추가:

```ts
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pongTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

- [ ] **Step 3: `useEffect` 안, `connect` 함수 선언 위에 heartbeat 시작/중지 헬퍼 추가**

```ts
    const stopHeartbeat = () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
      if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current)
      pingIntervalRef.current = null
      pongTimeoutRef.current = null
    }

    const startHeartbeat = (ws: WebSocket) => {
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ type: 'ping' }))
        pongTimeoutRef.current = setTimeout(() => {
          console.warn('[WS] pong 타임아웃 — 연결을 강제로 닫고 재연결합니다')
          ws.close()
        }, PONG_TIMEOUT_MS)
      }, PING_INTERVAL_MS)
    }
```

- [ ] **Step 4: `ws.onopen`에서 heartbeat 시작**

`ws.onopen`을 아래로 교체:

```ts
      ws.onopen = () => {
        console.log('[WS] 연결됨')
        startHeartbeat(ws)
        retryCountRef.current = 0
      }
```

- [ ] **Step 5: `ws.onmessage`에서 pong 수신 시 워치독 타이머 취소**

`ws.onmessage` 안, `JSON.parse` try/catch 바로 다음(다른 payload 분기들보다 위)에 추가:

```ts
        if (payload.type === 'pong') {
          if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current)
          return
        }
```

- [ ] **Step 6: `ws.onclose`에서 heartbeat 정리**

`ws.onclose` 콜백 맨 앞(`console.log('[WS] 연결 종료')` 다음 줄)에 추가:

```ts
        stopHeartbeat()
```

- [ ] **Step 7: 언마운트 cleanup에서도 heartbeat 정리**

`return () => { cancelled = true` 다음 줄에 추가:

```ts
      stopHeartbeat()
```

- [ ] **Step 8: 타입 체크로 검증**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 9: 브라우저에서 수동 확인**

콘솔에서 30초 간격으로 ping이 나가는지(Network 탭 WS 프레임 확인 또는 백엔드 로그) 확인. 강제로 pong 타임아웃을 재현하려면 개발자도구 Network 탭에서 오프라인 모드로 전환한 뒤 10초 이상 대기 — `[WS] pong 타임아웃...` 로그 후 재연결 시퀀스가 이어지는지 확인.

- [ ] **Step 10: 커밋**

```bash
git add frontend/src/hooks/useWebSocket.ts
git commit -m "feat: frontend - WebSocket heartbeat로 dead 연결 감지"
```

---

### Task 4: `connectionStatus` 반환 + 재연결 시 메시지 재조회

**Files:**
- Modify: `frontend/src/hooks/useWebSocket.ts`

**Interfaces:**
- Consumes: `useChatStore.getState().activeRoomId`, `useChatStore.getState().fetchMessages(roomId: string): Promise<void>` (기존 스토어 함수, 신규 아님)
- Produces: 훅 반환값에 `connectionStatus: 'connected' | 'connecting'` 추가 — Task 5에서 `ChatLayout.tsx`가 이 값을 구조분해해서 배너 렌더링에 사용.

- [ ] **Step 1: `useState` import 추가**

파일 최상단 import를 아래로 교체:

```ts
import { useEffect, useRef, useCallback, useState } from 'react'
```

- [ ] **Step 2: `connectionStatus` state 추가**

`reconnectTimeoutRef` 선언 다음 줄(heartbeat ref들보다 위, 순서 무관)에 추가:

```ts
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting'>('connecting')
```

- [ ] **Step 3: `ws.onopen`에서 상태 갱신 + 재연결 시 메시지 재조회**

`ws.onopen`을 아래로 교체:

```ts
      ws.onopen = () => {
        console.log('[WS] 연결됨')
        setConnectionStatus('connected')
        startHeartbeat(ws)

        // retryCountRef가 0보다 크다는 건 최초 연결이 아니라 재연결이라는 뜻.
        // 끊긴 동안 서버가 놓친 이벤트를 재전송해주지 않으므로, 현재 보고 있는 방의
        // 메시지를 REST로 다시 조회해서 최신 상태로 맞춘다.
        if (retryCountRef.current > 0) {
          const { activeRoomId, fetchMessages } = useChatStore.getState()
          if (activeRoomId) fetchMessages(activeRoomId)
        }
        retryCountRef.current = 0
      }
```

- [ ] **Step 4: `ws.onclose`에서 상태를 `'connecting'`으로 갱신**

`ws.onclose` 전체를 아래로 교체 (`setConnectionStatus('connecting')` 한 줄만 추가된 것):

```ts
      ws.onclose = () => {
        console.log('[WS] 연결 종료')
        stopHeartbeat()
        if (cancelled) return

        setConnectionStatus('connecting')
        const delay = getBackoffDelay(retryCountRef.current)
        retryCountRef.current += 1
        console.log(`[WS] ${Math.round(delay)}ms 후 재연결 시도 (${retryCountRef.current}번째)`)
        reconnectTimeoutRef.current = setTimeout(connect, delay)
      }
```

- [ ] **Step 5: 훅 반환값에 `connectionStatus` 추가**

파일 맨 아래 `return` 문을 아래로 교체:

```ts
  return { sendMessage, sendTypingStart, sendTypingStop, sendReadUpdate, sendReaction, connectionStatus }
```

- [ ] **Step 6: 타입 체크로 검증**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/hooks/useWebSocket.ts
git commit -m "feat: frontend - connectionStatus 반환 및 재연결 시 메시지 재조회"
```

---

### Task 5: `ChatLayout.tsx` 재연결 배너 UI

**Files:**
- Modify: `frontend/src/components/Chat/ChatLayout.tsx:18` (구조분해)
- Modify: `frontend/src/components/Chat/ChatLayout.tsx:62-88` (JSX)
- Modify: `frontend/src/components/Chat/ChatLayout.tsx:90-103` (styles)

**Interfaces:**
- Consumes: `useWebSocket(token).connectionStatus: 'connected' | 'connecting'` (Task 4에서 추가됨)

`connectionStatus === 'connecting'`일 때만 화면 상단에 작은 배너를 띄운다. 채팅 화면 자체는 그대로 두고 눈에 띄지 않게 알리기만 하는 방식(사용자가 명시적으로 선택).

- [ ] **Step 1: `connectionStatus` 구조분해 추가**

`frontend/src/components/Chat/ChatLayout.tsx:18`의 아래 줄을:

```tsx
  const { sendMessage, sendTypingStart, sendTypingStop, sendReadUpdate, sendReaction } = useWebSocket(token)
```

아래로 교체:

```tsx
  const { sendMessage, sendTypingStart, sendTypingStop, sendReadUpdate, sendReaction, connectionStatus } = useWebSocket(token)
```

- [ ] **Step 2: JSX 최상단에 배너 추가**

`frontend/src/components/Chat/ChatLayout.tsx:62-64`의 아래 부분을:

```tsx
  return (
    <div style={styles.container}>
      {showSidebar && <Sidebar onSelectRoom={handleSelectRoom} activeRoomId={activeRoomId} isMobile={isMobile} />}
```

아래로 교체 (배너를 `container`보다 위, `position: fixed`로 겹쳐 띄우므로 전체를 감싸는 프래그먼트로 변경):

```tsx
  return (
    <>
      {connectionStatus === 'connecting' && (
        <div style={styles.reconnectBanner}>연결이 끊겼습니다. 재연결 중...</div>
      )}
      <div style={styles.container}>
        {showSidebar && <Sidebar onSelectRoom={handleSelectRoom} activeRoomId={activeRoomId} isMobile={isMobile} />}
```

- [ ] **Step 3: 최상위 태그를 닫는 부분도 프래그먼트로 맞춤**

`frontend/src/components/Chat/ChatLayout.tsx:84-87`의 아래 부분을:

```tsx
        </div>
      )}
    </div>
  )
}
```

아래로 교체:

```tsx
        </div>
      )}
      </div>
    </>
  )
}
```

- [ ] **Step 4: 배너 스타일 추가**

`frontend/src/components/Chat/ChatLayout.tsx` 파일 맨 끝, `styles` 객체의 `placeholderSub` 항목 다음에 추가:

```ts
  reconnectBanner: {
    position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
    marginTop: '0.5rem', padding: '0.4rem 1rem', borderRadius: 8,
    background: '#f59e0b', color: '#fff', fontSize: '0.8rem', fontWeight: 600,
    boxShadow: 'var(--shadow-modal)',
  },
```

- [ ] **Step 5: 타입 체크 + 빌드로 검증**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: 에러 없음, 빌드 성공

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/components/Chat/ChatLayout.tsx
git commit -m "feat: frontend - WebSocket 재연결 상태 배너 추가"
```

---

### Task 6: 전체 통합 수동 테스트

**Files:** 없음 (코드 변경 없이 브라우저에서 전체 흐름 검증)

- [ ] **Step 1: 정상 재연결 흐름**

`docker compose up`으로 스택 실행 → 브라우저에서 로그인 후 채팅방 진입 → `docker compose restart backend` 실행. 기대 결과: 화면 상단에 "연결이 끊겼습니다. 재연결 중..." 배너가 뜨고, 백엔드가 다시 뜨면 자동으로 재연결되어 배너가 사라진다.

- [ ] **Step 2: 재연결 후 메시지 복구**

브라우저 A에서 채팅방을 연 상태에서 `docker compose restart backend` 실행 → 배너가 뜨고 재연결 대기 중일 때, 브라우저 B(다른 계정, 시크릿창)로 같은 방에 메시지 전송 → 브라우저 A가 재연결되면 그 메시지가 화면에 나타나는지 확인 (재연결 시 `fetchMessages`로 최신화되므로 나타나야 함).

- [ ] **Step 3: 지수 백오프 지연시간 확인**

백엔드를 계속 내려둔 상태(재시작하지 않고 완전히 정지: `docker compose stop backend`)에서 콘솔 로그를 관찰 → `1000ms 후...`, `2000ms 후...`, `4000ms 후...`처럼 지연시간이 늘어나다가 30000ms 근처에서 멈추는지 확인. 확인 후 `docker compose start backend`로 복구.

- [ ] **Step 4: Heartbeat 동작 확인**

개발자도구 Network 탭에서 WS 연결을 선택해 프레임을 관찰 → 30초 간격으로 `{"type":"ping"}` 전송과 `{"type":"pong"}` 수신이 반복되는지 확인.

- [ ] **Step 5: 로그아웃 시 재연결 타이머 정리 확인**

백엔드를 내려서 재연결 대기 상태(배너 노출)로 만든 뒤 로그아웃 → 콘솔에 더 이상 `[WS] ... 재연결 시도` 로그가 찍히지 않는지 확인 (정리 안 되면 로그아웃 후에도 백그라운드에서 재연결을 계속 시도하는 버그).

- [ ] **Step 6: 문제 없으면 최종 커밋 없음 (이미 Task별로 커밋 완료)**

이 태스크는 검증 전용이라 코드 변경이 없다. 문제가 발견되면 해당 태스크로 돌아가 수정 후 다시 커밋한다.

import { useEffect, useRef, useCallback, useState } from 'react'
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

// heartbeat — 30초마다 ping, 10초 안에 pong 없으면 죽은 연결로 간주
const PING_INTERVAL_MS = 30 * 1000
const PONG_TIMEOUT_MS = 10 * 1000

export function useWebSocket(token: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const retryCountRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pongTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting'>('connecting')

  useEffect(() => {
    if (!token) return

    // 언마운트/token 변경(로그아웃 등) 이후에는 예약된 재연결이 실행되면 안 되므로 플래그로 막는다.
    let cancelled = false

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
        // pong이 10초 안에 안 오면 소켓이 사실상 죽은 것으로 간주하고 강제로 닫는다.
        // ws.close()를 호출하면 브라우저가 onclose를 발생시키므로 재연결 스케줄링은
        // 아래 onclose 핸들러가 그대로 처리한다 (재연결 로직 중복 작성 불필요)
        pongTimeoutRef.current = setTimeout(() => {
          console.warn('[WS] pong 타임아웃 — 연결을 강제로 닫고 재연결합니다')
          ws.close()
        }, PONG_TIMEOUT_MS)
      }, PING_INTERVAL_MS)
    }

    const connect = () => {
      if (cancelled) return

      // handshake: HTTP → WebSocket 업그레이드 요청
      // JWT를 쿼리 파라미터로 전달 (WebSocket은 커스텀 헤더를 자유롭게 설정할 수 없음)
      const ws = new WebSocket(`${WS_URL}/ws?token=${token}`)
      wsRef.current = ws

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

        if (payload.type === 'pong') {
          if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current)
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
            reactions: [], // 방금 도착한 메시지라 리액션이 있을 수 없음
          })
          // 지금 열어보고 있는 방이 아니면 안읽음 뱃지 +1.
          // 내가 보낸 메시지도 이 이벤트를 그대로 받긴 하지만, 메시지는 항상 activeRoomId로만
          // 보낼 수 있어서(MessageInput이 현재 열린 방 기준으로 동작) room_id === activeRoomId가 되어
          // 자연스럽게 카운트되지 않음 — 별도로 내 메시지인지 구분할 필요가 없음
          if (payload.room_id !== activeRoomId) {
            incrementUnread(payload.room_id)
          }
        } else if (payload.type === 'typing.indicator') {
          setTyping(payload.room_id, payload.username, payload.is_typing)
        } else if (payload.type === 'presence.update') {
          setOnline(payload.user_id, payload.status)
        } else if (payload.type === 'friend.request') {
          // 상대가 나에게 친구 요청을 보낸 경우. 서버 페이로드엔 요청 1건 정보만 담겨있지만,
          // 목록 자체는 최신 상태를 보장하기 위해 REST로 다시 조회함 (다른 필드 누락 걱정 없이 서버가 정답).
          fetchPendingRequests()
        } else if (payload.type === 'friend.accept') {
          // 내가 보낸 친구 요청을 상대가 수락한 경우. 친구 목록을 다시 조회해서 반영.
          fetchFriends()
        } else if (payload.type === 'friend.delete') {
          // 상대가 나를 친구 삭제한 경우. 삭제는 REST 재조회 없이도 어떤 항목을 지워야 할지
          // payload의 user_id만으로 알 수 있으니, 로컬 상태에서 바로 필터링
          removeFriend(payload.user_id)
        } else if (payload.type === 'room.invite') {
          // 그룹방 초대 / DM 신규 생성 둘 다 이 타입으로 오되, is_dm으로 구분해서
          // 해당하는 목록만 다시 조회
          if (payload.is_dm) {
            fetchDmRooms()
          } else {
            fetchRooms()
          }
        } else if (payload.type === 'reaction.update') {
          // 내가 리액션을 눌렀을 때도 이 이벤트가 그대로 돌아옴(브로드캐스트에서 나를 제외하지 않음).
          // 서버가 계산한 "해당 메시지의 이모지별 최신 상태" 전체로 덮어쓰기만 하면 되므로,
          // 클라이언트에서 낙관적으로 먼저 반영해뒀다가 나중에 맞춰줄 필요가 없음
          updateReactions(payload.room_id, payload.message_id, payload.reactions)
        }
      }

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

      ws.onerror = (e) => {
        console.error('[WS] 에러', e)
      }
    }

    connect()

    // 언마운트/token 변경 시 예약된 재연결 타이머를 반드시 정리한다.
    // 정리하지 않으면 로그아웃 후에도 백그라운드에서 재연결 시도가 계속 발생할 수 있다.
    return () => {
      cancelled = true
      stopHeartbeat()
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      wsRef.current?.close()
    }
  }, [token])

  // 메시지 전송 헬퍼들 — 내부적으로 ws.send()로 JSON 문자열을 서버에 push
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

  return { sendMessage, sendTypingStart, sendTypingStop, sendReadUpdate, sendReaction, connectionStatus }
}

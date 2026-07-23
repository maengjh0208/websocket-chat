import { useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '@/store/chat'
import { useFriendStore } from '@/store/friend'
import type { WSPayload } from '@/types'

const WS_URL = import.meta.env.VITE_WS_URL

export function useWebSocket(token: string | null) {
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!token) return

    // handshake: HTTP → WebSocket 업그레이드 요청
    // JWT를 쿼리 파라미터로 전달 (WebSocket은 커스텀 헤더를 자유롭게 설정할 수 없음)
    const ws = new WebSocket(`${WS_URL}/ws?token=${token}`)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[WS] 연결됨')
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

      const { addMessage, setTyping, setOnline, fetchRooms, fetchDmRooms, incrementUnread, activeRoomId } =
        useChatStore.getState()
      const { fetchPendingRequests, fetchFriends, removeFriend } = useFriendStore.getState()

      if (payload.type === 'message.new') {
        addMessage({
          id: payload.id,
          room_id: payload.room_id,
          sender: payload.sender,
          content: payload.content,
          created_at: payload.created_at,
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
      }
    }

    ws.onclose = () => {
      console.log('[WS] 연결 종료')
    }

    ws.onerror = (e) => {
      console.error('[WS] 에러', e)
    }

    // 2분마다 ping 전송 → 백엔드에서 Redis TTL 갱신
    // 아무 활동이 없어도 presence 상태가 만료되지 않도록 유지
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 2 * 60 * 1000)

    // 언마운트 시 연결 해제 (생명주기 끝)
    return () => {
      clearInterval(pingInterval)
      ws.close()
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

  return { sendMessage, sendTypingStart, sendTypingStop, sendReadUpdate }
}

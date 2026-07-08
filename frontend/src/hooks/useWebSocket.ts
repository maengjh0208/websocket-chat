import { useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '@/store/chat'
import type { WSPayload } from '@/types'

const WS_URL = import.meta.env.VITE_WS_URL

export function useWebSocket(token: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const { addMessage, setTyping, setOnline } = useChatStore()

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
    ws.onmessage = (event: MessageEvent) => {
      let payload: WSPayload
      try {
        payload = JSON.parse(event.data) as WSPayload
      } catch {
        return
      }

      if (payload.type === 'message.new') {
        addMessage({
          id: payload.id,
          room_id: payload.room_id,
          sender: payload.sender,
          content: payload.content,
          created_at: payload.created_at,
        })
      } else if (payload.type === 'typing.indicator') {
        setTyping(payload.room_id, payload.username, payload.is_typing)
      } else if (payload.type === 'presence.update') {
        setOnline(payload.user_id, payload.status)
      }
    }

    ws.onclose = () => {
      console.log('[WS] 연결 종료')
    }

    ws.onerror = (e) => {
      console.error('[WS] 에러', e)
    }

    // 언마운트 시 연결 해제 (생명주기 끝)
    return () => {
      ws.close()
    }
  }, [token, addMessage, setTyping, setOnline])

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

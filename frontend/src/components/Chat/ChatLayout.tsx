import { useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { useChatStore } from '@/store/chat'
import { useWebSocket } from '@/hooks/useWebSocket'
import Sidebar from './Sidebar'
import ChatWindow from './ChatWindow'

// useWebSocket은 여기서 한 번만 호출 — 앱 전체에서 WebSocket 연결은 하나
// token이 바뀌면(로그아웃 등) useEffect가 재실행되어 연결을 새로 맺음
export default function ChatLayout() {
  const token = useAuthStore((s) => s.token)
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const setActiveRoom = useChatStore((s) => s.setActiveRoom)

  const { sendMessage, sendTypingStart, sendTypingStop, sendReadUpdate } = useWebSocket(token)

  const handleSelectRoom = useCallback((roomId: string) => {
    setActiveRoom(roomId)
  }, [setActiveRoom])

  const handleSendMessage = useCallback(
    (content: string) => {
      if (activeRoomId) sendMessage(activeRoomId, content)
    },
    [activeRoomId, sendMessage],
  )

  const handleTypingStart = useCallback(() => {
    if (activeRoomId) sendTypingStart(activeRoomId)
  }, [activeRoomId, sendTypingStart])

  const handleTypingStop = useCallback(() => {
    if (activeRoomId) sendTypingStop(activeRoomId)
  }, [activeRoomId, sendTypingStop])

  const handleReadUpdate = useCallback(() => {
    if (activeRoomId) sendReadUpdate(activeRoomId)
  }, [activeRoomId, sendReadUpdate])

  return (
    <div style={styles.container}>
      <Sidebar onSelectRoom={handleSelectRoom} activeRoomId={activeRoomId} />
      <div style={styles.main}>
        {activeRoomId ? (
          <ChatWindow
            roomId={activeRoomId}
            onSendMessage={handleSendMessage}
            onTypingStart={handleTypingStart}
            onTypingStop={handleTypingStop}
            onReadUpdate={handleReadUpdate}
          />
        ) : (
          <div style={styles.placeholder}>
            <p>왼쪽 + 버튼으로 채팅방을 만들거나 선택하세요.</p>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', height: '100vh', overflow: 'hidden' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  placeholder: {
    flex: 1, display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: '#9ca3af',
  },
}

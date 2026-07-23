import { useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { useChatStore } from '@/store/chat'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useIsMobile } from '@/hooks/useIsMobile'
import Sidebar from './Sidebar'
import ChatWindow from './ChatWindow'

// useWebSocket은 여기서 한 번만 호출 — 앱 전체에서 WebSocket 연결은 하나
// token이 바뀌면(로그아웃 등) useEffect가 재실행되어 연결을 새로 맺음
export default function ChatLayout() {
  const token = useAuthStore((s) => s.token)
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const setActiveRoom = useChatStore((s) => s.setActiveRoom)
  const isMobile = useIsMobile()

  const { sendMessage, sendTypingStart, sendTypingStop, sendReadUpdate } = useWebSocket(token)

  const handleSelectRoom = useCallback((roomId: string) => {
    setActiveRoom(roomId)
  }, [setActiveRoom])

  // 모바일에서 채팅방 화면 좌상단 뒤로가기 버튼 → 목록 화면으로 복귀
  const handleBack = useCallback(() => {
    setActiveRoom(null)
  }, [setActiveRoom])

  const handleSendMessage = useCallback(
    (content: string) => { if (activeRoomId) sendMessage(activeRoomId, content) },
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

  // 모바일에선 목록/채팅 화면을 동시에 두 개 다 보여줄 화면 폭이 없어서,
  // 항상 하나만 렌더링하고 activeRoomId 유무로 어느 쪽을 보여줄지 전환함
  // (PC는 기존처럼 사이드바+채팅창을 나란히 항상 같이 보여줌)
  const showSidebar = !isMobile || !activeRoomId
  const showMain = !isMobile || !!activeRoomId

  return (
    <div style={styles.container}>
      {showSidebar && <Sidebar onSelectRoom={handleSelectRoom} activeRoomId={activeRoomId} isMobile={isMobile} />}
      {showMain && (
        <div style={styles.main}>
          {activeRoomId ? (
            <ChatWindow
              roomId={activeRoomId}
              onSendMessage={handleSendMessage}
              onTypingStart={handleTypingStart}
              onTypingStop={handleTypingStop}
              onReadUpdate={handleReadUpdate}
              onBack={isMobile ? handleBack : undefined}
            />
          ) : (
            <div style={styles.placeholder}>
              <div style={styles.placeholderMark} />
              <p style={styles.placeholderTitle}>대화를 시작해보세요</p>
              <p style={styles.placeholderSub}>왼쪽에서 채팅방을 선택하거나 새 방을 만드세요.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', height: '100vh', overflow: 'hidden' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  placeholder: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: '0.5rem', background: 'var(--bg-message-list)',
  },
  placeholderMark: {
    width: 40, height: 40, borderRadius: 12,
    background: 'linear-gradient(135deg, #6366f1, #4f46e5)', marginBottom: '0.5rem',
  },
  placeholderTitle: { fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 },
  placeholderSub: { fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 },
}

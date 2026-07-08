import { useEffect, useRef } from 'react'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import MessageBubble from './MessageBubble'
import TypingIndicator from './TypingIndicator'
import MessageInput from './MessageInput'

interface Props {
  roomId: string
  onSendMessage: (content: string) => void
  onTypingStart: () => void
  onTypingStop: () => void
  onReadUpdate: () => void
}

// WebSocket 연결 포인트:
// - 방에 입장할 때 read.update push → 서버가 last_read_at 업데이트
// - 새 message.new가 수신되면 addMessage(store)를 통해 자동으로 목록에 추가됨
export default function ChatWindow({ roomId, onSendMessage, onTypingStart, onTypingStop, onReadUpdate }: Props) {
  const messages = useChatStore((s) => s.messages[roomId] ?? [])
  const typing = useChatStore((s) => s.typing[roomId] ?? [])
  const { fetchMessages } = useChatStore()
  const { user } = useAuthStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchMessages(roomId)
    onReadUpdate() // 방 입장 시 읽음 처리
  }, [roomId])

  // 새 메시지가 오면 스크롤을 맨 아래로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div style={styles.container}>
      <div style={styles.messageList}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} isMe={msg.sender.id === user?.id} />
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={styles.bottom}>
        <TypingIndicator typingUsers={typing} />
        <MessageInput
          roomId={roomId}
          onSendMessage={onSendMessage}
          onTypingStart={onTypingStart}
          onTypingStop={onTypingStop}
        />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
  messageList: { flex: 1, overflowY: 'auto', padding: '1rem' },
  bottom: { flexShrink: 0, padding: '0 1rem' },
}

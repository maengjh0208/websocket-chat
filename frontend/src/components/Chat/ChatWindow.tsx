import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import MessageBubble from './MessageBubble'
import TypingIndicator from './TypingIndicator'
import MessageInput from './MessageInput'
import InviteMemberModal from './InviteMemberModal'
import MemberListModal from './MemberListModal'

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
  const room = useChatStore((s) => s.rooms.find((r) => r.id === roomId))
  const { fetchMessages } = useChatStore()
  const { user } = useAuthStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [showMembers, setShowMembers] = useState(false)

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
      <div style={styles.header}>
        <span style={styles.roomName}>{room?.is_dm ? '👤' : '#'} {room?.name ?? ''}</span>
        <div style={styles.headerActions}>
          <button style={styles.membersBtn} onClick={() => setShowMembers(true)}>
            👥 멤버
          </button>
          {!room?.is_dm && (
            <button style={styles.inviteBtn} onClick={() => setShowInvite(true)}>
              + 멤버 초대
            </button>
          )}
        </div>
      </div>

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

      {showInvite && (
        <InviteMemberModal roomId={roomId} onClose={() => setShowInvite(false)} />
      )}
      {showMembers && (
        <MemberListModal roomId={roomId} onClose={() => setShowMembers(false)} />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb',
    flexShrink: 0,
  },
  roomName: { fontSize: '1rem', fontWeight: 600, color: '#111827' },
  headerActions: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  membersBtn: {
    padding: '0.35rem 0.75rem', background: '#f3f4f6', color: '#374151',
    border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer',
  },
  inviteBtn: {
    padding: '0.35rem 0.75rem', background: '#4f46e5', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer',
  },
  messageList: { flex: 1, overflowY: 'auto', padding: '1rem' },
  bottom: { flexShrink: 0, padding: '0 1rem' },
}

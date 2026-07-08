import type { Message } from '@/types'

interface Props {
  message: Message
  isMe: boolean
}

export default function MessageBubble({ message, isMe }: Props) {
  const time = new Date(message.created_at).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div style={{ ...styles.row, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
      {!isMe && <span style={styles.username}>{message.sender.username}</span>}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
        {!isMe && <span style={styles.senderName}>{message.sender.username}</span>}
        <div style={{ ...styles.bubble, background: isMe ? '#4f46e5' : '#e5e7eb', color: isMe ? '#fff' : '#111' }}>
          {message.content}
        </div>
        <span style={styles.time}>{time}</span>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: 'flex', marginBottom: '0.5rem' },
  username: { display: 'none' },
  senderName: { fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.2rem' },
  bubble: {
    maxWidth: 320,
    padding: '0.5rem 0.85rem',
    borderRadius: 12,
    fontSize: '0.95rem',
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  time: { fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.2rem' },
}

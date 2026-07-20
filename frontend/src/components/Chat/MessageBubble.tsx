import type { Message } from '@/types'

interface Props {
  message: Message
  isMe: boolean
  showHeader: boolean
}

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6']

function avatarColor(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function MessageBubble({ message, isMe, showHeader }: Props) {
  const time = new Date(message.created_at).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const initial = message.sender.username[0].toUpperCase()
  const color = avatarColor(message.sender.username)

  if (isMe) {
    return (
      <div style={{ ...styles.row, justifyContent: 'flex-end', marginTop: showHeader ? '0.75rem' : '0.35rem' }}>
        <div style={styles.myMeta}>
          <span style={styles.time}>{time}</span>
          <div style={styles.myBubble}>{message.content}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...styles.row, alignItems: 'flex-start', marginTop: showHeader ? '0.75rem' : '0.35rem' }}>
      {showHeader
        ? <div style={{ ...styles.avatar, background: color }}>{initial}</div>
        : <div style={styles.avatarPlaceholder} />
      }
      <div style={styles.otherGroup}>
        {showHeader && <span style={styles.senderName}>{message.sender.username}</span>}
        <div style={styles.otherRow}>
          <div style={styles.otherBubble}>{message.content}</div>
          <span style={styles.time}>{time}</span>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: 'flex', gap: '0.5rem' },
  avatar: {
    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: '0.8rem', fontWeight: 700,
  },
  avatarPlaceholder: { width: 32, flexShrink: 0 },
  otherGroup: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: 280 },
  senderName: { fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem', paddingLeft: '0.25rem' },
  otherRow: { display: 'flex', alignItems: 'flex-end', gap: '0.4rem' },
  otherBubble: {
    background: 'var(--bubble-other-bg)',
    border: '1px solid var(--bubble-other-border)',
    borderRadius: '4px 16px 16px 16px',
    padding: '0.55rem 0.9rem',
    fontSize: '0.9rem',
    lineHeight: 1.55,
    wordBreak: 'break-word',
    boxShadow: 'var(--shadow-bubble)',
    color: 'var(--text-primary)',
  },
  myMeta: { display: 'flex', alignItems: 'flex-end', gap: '0.4rem' },
  myBubble: {
    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    color: '#fff',
    borderRadius: '16px 4px 16px 16px',
    padding: '0.55rem 0.9rem',
    fontSize: '0.9rem',
    lineHeight: 1.55,
    wordBreak: 'break-word',
    maxWidth: 280,
    boxShadow: 'var(--shadow-my-bubble)',
  },
  time: { fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 },
}

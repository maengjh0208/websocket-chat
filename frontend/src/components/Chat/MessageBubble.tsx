import { useEffect, useRef, useState } from 'react'
import type { Message, ReactionSummary, User } from '@/types'

interface Props {
  message: Message
  isMe: boolean
  showHeader: boolean
  currentUserId?: string
  allowedReactions: string[]
  roomMembers: User[]
  onReact: (messageId: string, emoji: string) => void
}

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6']

function avatarColor(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// 리액션한 user_id들을 방 멤버 목록에서 username으로 바꿔서 툴팁 문구를 만듦.
// 방을 나간 유저는 roomMembers에 없어서 매칭이 안 되는데, 그 경우 그냥 목록에서 빠짐 (지금 스코프에서 크게 중요하지 않은 엣지케이스)
function resolveReactorNames(userIds: string[], members: User[]): string {
  const names = userIds
    .map((id) => members.find((m) => m.id === id)?.username)
    .filter((name): name is string => Boolean(name))
  return names.length > 0 ? `${names.join(', ')}님이 반응했습니다` : '반응했습니다'
}

export default function MessageBubble({
  message,
  isMe,
  showHeader,
  currentUserId,
  allowedReactions,
  roomMembers,
  onReact,
}: Props) {
  const [isHovered, setIsHovered] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [hoveredEmoji, setHoveredEmoji] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // 피커가 열려 있을 때 바깥을 클릭하면 닫히도록 함
  useEffect(() => {
    if (!showPicker) return
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPicker])

  const time = new Date(message.created_at).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const initial = message.sender.username[0].toUpperCase()
  const color = avatarColor(message.sender.username)
  const reactions = message.reactions ?? []

  const handlePickEmoji = (emoji: string) => {
    onReact(message.id, emoji)
    setShowPicker(false)
  }

  const addButton = (
    <div ref={pickerRef} style={styles.pickerAnchor}>
      <button
        type="button"
        style={{ ...styles.addBtn, opacity: isHovered || showPicker ? 1 : 0 }}
        onClick={() => setShowPicker((v) => !v)}
        title="리액션 추가"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path d="M9 10h.01M15 10h.01M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {showPicker && (
        <div style={{ ...styles.picker, ...(isMe ? { right: 0 } : { left: 0 }) }}>
          {allowedReactions.map((emoji) => (
            <button key={emoji} type="button" style={styles.pickerEmoji} onClick={() => handlePickEmoji(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  const reactionsRow = reactions.length > 0 && (
    <div style={{ ...styles.reactionsRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
      {reactions.map((r: ReactionSummary) => {
        const reactedByMe = !!currentUserId && r.user_ids.includes(currentUserId)
        return (
          <div
            key={r.emoji}
            style={styles.pillWrap}
            onMouseEnter={() => setHoveredEmoji(r.emoji)}
            onMouseLeave={() => setHoveredEmoji((cur) => (cur === r.emoji ? null : cur))}
          >
            <button
              type="button"
              style={{ ...styles.pill, ...(reactedByMe ? styles.pillActive : {}) }}
              onClick={() => onReact(message.id, r.emoji)}
            >
              <span>{r.emoji}</span>
              <span style={styles.pillCount}>{r.user_ids.length}</span>
            </button>
            {hoveredEmoji === r.emoji && (
              <div style={{ ...styles.tooltip, ...(isMe ? { right: 0 } : { left: 0 }) }}>
                {resolveReactorNames(r.user_ids, roomMembers)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  if (isMe) {
    return (
      <div
        style={{ ...styles.column, alignItems: 'flex-end', marginTop: showHeader ? '0.75rem' : '0.35rem' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div style={{ ...styles.row, justifyContent: 'flex-end' }}>
          {addButton}
          <div style={styles.myMeta}>
            <span style={styles.time}>{time}</span>
            <div style={styles.myBubble}>{message.content}</div>
          </div>
        </div>
        {reactionsRow}
      </div>
    )
  }

  return (
    <div
      style={{ ...styles.column, alignItems: 'flex-start', marginTop: showHeader ? '0.75rem' : '0.35rem' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ ...styles.row, alignItems: 'flex-start' }}>
        {showHeader
          ? <div style={{ ...styles.avatar, background: color }}>{initial}</div>
          : <div style={styles.avatarPlaceholder} />
        }
        <div style={styles.otherGroup}>
          {showHeader && <span style={styles.senderName}>{message.sender.username}</span>}
          <div style={styles.otherRow}>
            <div style={styles.otherBubble}>{message.content}</div>
            <span style={styles.time}>{time}</span>
            {addButton}
          </div>
        </div>
      </div>
      {reactionsRow && <div style={styles.otherReactionsIndent}>{reactionsRow}</div>}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  column: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  row: { display: 'flex', gap: '0.5rem' },
  avatar: {
    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: '0.8rem', fontWeight: 700,
  },
  avatarPlaceholder: { width: 32, flexShrink: 0 },
  otherGroup: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: 280 },
  otherReactionsIndent: { paddingLeft: 'calc(32px + 0.5rem)' },
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

  pickerAnchor: { position: 'relative', display: 'flex', alignItems: 'flex-end' },
  addBtn: {
    width: 26, height: 26, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0,
    transition: 'opacity 0.15s',
  },
  picker: {
    position: 'absolute', bottom: 'calc(100% + 6px)', zIndex: 20,
    display: 'flex', gap: '0.15rem',
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 20, padding: '0.3rem', boxShadow: 'var(--shadow-modal)',
  },
  pickerEmoji: {
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1.05rem', background: 'none', border: 'none', borderRadius: '50%', cursor: 'pointer',
  },

  reactionsRow: { display: 'flex', flexWrap: 'wrap', gap: '0.3rem' },
  pillWrap: { position: 'relative' },
  pill: {
    display: 'flex', alignItems: 'center', gap: '0.3rem',
    padding: '0.15rem 0.5rem', borderRadius: 12,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer',
  },
  pillActive: {
    background: 'var(--room-active-bg)', borderColor: 'var(--room-active-text)', color: 'var(--room-active-text)',
  },
  pillCount: { fontSize: '0.72rem', fontWeight: 600 },
  tooltip: {
    // left/right는 호출부에서 isMe에 따라 지정 (같은 방향으로 정렬해서 화면 가장자리 밖으로 안 넘치게)
    position: 'absolute', bottom: 'calc(100% + 6px)',
    background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6,
    padding: '0.3rem 0.6rem', fontSize: '0.72rem', color: 'var(--text-secondary)',
    whiteSpace: 'nowrap', boxShadow: 'var(--shadow-modal)', zIndex: 30,
    maxWidth: '60vw', overflow: 'hidden', textOverflow: 'ellipsis',
  },
}

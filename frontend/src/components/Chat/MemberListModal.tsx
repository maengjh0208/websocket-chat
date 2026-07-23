import { useEffect } from 'react'
import { useChatStore } from '@/store/chat'

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6']
function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

interface Props { roomId: string; onClose: () => void }

export default function MemberListModal({ roomId, onClose }: Props) {
  const members = useChatStore((s) => s.roomMembers[roomId] ?? [])
  const fetchRoomMembers = useChatStore((s) => s.fetchRoomMembers)

  useEffect(() => {
    fetchRoomMembers(roomId)
  }, [roomId])

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>멤버 목록</span>
          <button style={styles.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <ul style={styles.list}>
          {members.map((member) => (
            <li key={member.id} style={styles.item}>
              <span style={{ ...styles.avatar, background: avatarColor(member.username) }}>
                {member.username[0].toUpperCase()}
              </span>
              <span style={styles.username}>{member.username}</span>
            </li>
          ))}
          {members.length === 0 && <li style={styles.empty}>불러오는 중...</li>}
        </ul>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'var(--overlay)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    background: 'var(--bg-surface)', borderRadius: 12, width: '90vw', maxWidth: 320,
    boxShadow: 'var(--shadow-modal)', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)',
  },
  title: { fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0.25rem',
  },
  list: { listStyle: 'none', margin: 0, padding: '0.5rem 0', maxHeight: 320, overflowY: 'auto' },
  item: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1.25rem' },
  avatar: {
    width: 32, height: 32, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: '0.85rem', fontWeight: 700, flexShrink: 0,
  },
  username: { fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 },
  empty: { padding: '1rem 1.25rem', color: 'var(--text-muted)', fontSize: '0.875rem' },
}

import { useEffect } from 'react'
import { useChatStore } from '@/store/chat'

interface Props {
  roomId: string
  onClose: () => void
}

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
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        <ul style={styles.list}>
          {members.map((member) => (
            <li key={member.id} style={styles.item}>
              <span style={styles.avatar}>{member.username[0].toUpperCase()}</span>
              <span style={styles.username}>{member.username}</span>
            </li>
          ))}
          {members.length === 0 && (
            <li style={styles.empty}>불러오는 중...</li>
          )}
        </ul>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: '#fff', borderRadius: 12, width: 320,
    boxShadow: '0 8px 30px rgba(0,0,0,0.15)', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb',
  },
  title: { fontWeight: 600, fontSize: '1rem', color: '#111827' },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '1.25rem', color: '#9ca3af', lineHeight: 1,
  },
  list: { listStyle: 'none', margin: 0, padding: '0.5rem 0', maxHeight: 320, overflowY: 'auto' },
  item: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.6rem 1.25rem',
  },
  avatar: {
    width: 32, height: 32, borderRadius: '50%',
    background: '#e0e7ff', color: '#4f46e5',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.85rem', fontWeight: 700, flexShrink: 0,
  },
  username: { fontSize: '0.9rem', color: '#374151' },
  empty: { padding: '1rem 1.25rem', color: '#9ca3af', fontSize: '0.875rem' },
}

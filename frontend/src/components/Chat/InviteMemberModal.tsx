import { useState, useEffect } from 'react'
import apiClient from '@/api/client'
import { useAuthStore } from '@/store/auth'
import type { User } from '@/types'

interface Props {
  roomId: string
  onClose: () => void
}

export default function InviteMemberModal({ roomId, onClose }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [inviting, setInviting] = useState<string | null>(null) // 현재 초대 요청 중인 userId
  const [invited, setInvited] = useState<Set<string>>(new Set()) // 이미 초대한 userId
  const currentUser = useAuthStore((s) => s.user)

  useEffect(() => {
    apiClient.get<User[]>('/users').then((res) => setUsers(res.data))
  }, [])

  const handleInvite = async (userId: string) => {
    setInviting(userId)
    try {
      await apiClient.post(`/rooms/${roomId}/members`, { user_id: userId })
      setInvited((prev) => new Set(prev).add(userId))
    } finally {
      setInviting(null)
    }
  }

  const candidates = users.filter((u) => u.id !== currentUser?.id)

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>멤버 초대</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.userList}>
          {candidates.length === 0 && (
            <p style={styles.empty}>초대할 유저가 없습니다.</p>
          )}
          {candidates.map((u) => {
            const isInvited = invited.has(u.id)
            const isLoading = inviting === u.id
            return (
              <div key={u.id} style={styles.userItem}>
                <span style={styles.avatar}>{u.username[0].toUpperCase()}</span>
                <span style={styles.username}>{u.username}</span>
                <button
                  style={{ ...styles.inviteBtn, ...(isInvited ? styles.invitedBtn : {}) }}
                  disabled={isInvited || isLoading}
                  onClick={() => handleInvite(u.id)}
                >
                  {isLoading ? '...' : isInvited ? '초대됨' : '초대'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    background: '#fff', borderRadius: 10, padding: '1.5rem',
    width: 340, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '1.25rem',
  },
  title: { fontSize: '1rem', fontWeight: 600, color: '#111827' },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '1rem', color: '#6b7280', padding: '0.25rem',
  },
  userList: { display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 280, overflowY: 'auto' },
  empty: { color: '#9ca3af', fontSize: '0.85rem', margin: 0 },
  userItem: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.5rem 0.25rem',
  },
  avatar: {
    width: 32, height: 32, borderRadius: '50%', background: '#e0e7ff',
    color: '#4f46e5', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 600, fontSize: '0.85rem',
    flexShrink: 0,
  },
  username: { flex: 1, fontSize: '0.95rem', color: '#374151' },
  inviteBtn: {
    padding: '0.3rem 0.75rem', background: '#4f46e5', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer',
    flexShrink: 0,
  },
  invitedBtn: { background: '#d1fae5', color: '#065f46', cursor: 'default' },
}

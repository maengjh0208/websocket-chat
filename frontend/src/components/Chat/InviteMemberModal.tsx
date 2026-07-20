import { useState, useEffect } from 'react'
import apiClient from '@/api/client'
import { useAuthStore } from '@/store/auth'
import type { User } from '@/types'

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6']
function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

interface Props { roomId: string; onClose: () => void }

export default function InviteMemberModal({ roomId, onClose }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [inviting, setInviting] = useState<string | null>(null)
  const [invited, setInvited] = useState<Set<string>>(new Set())
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
          <button style={styles.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div style={styles.userList}>
          {candidates.length === 0 && <p style={styles.empty}>초대할 유저가 없습니다.</p>}
          {candidates.map((u) => {
            const isInvited = invited.has(u.id)
            const isLoading = inviting === u.id
            return (
              <div key={u.id} style={styles.userItem}>
                <span style={{ ...styles.avatar, background: avatarColor(u.username) }}>
                  {u.username[0].toUpperCase()}
                </span>
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
    position: 'fixed', inset: 0, background: 'var(--overlay)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    background: 'var(--bg-surface)', borderRadius: 12, padding: '1.5rem',
    width: 340, boxShadow: 'var(--shadow-modal)',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  title: { fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', padding: '0.25rem', display: 'flex', alignItems: 'center',
  },
  userList: { display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: 280, overflowY: 'auto' },
  empty: { color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 },
  userItem: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.25rem' },
  avatar: {
    width: 32, height: 32, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0,
  },
  username: { flex: 1, fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 },
  inviteBtn: {
    padding: '0.3rem 0.75rem', background: '#4f46e5', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
  },
  invitedBtn: { background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'default' },
}

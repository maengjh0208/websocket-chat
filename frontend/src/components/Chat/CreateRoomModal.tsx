import { useState, useEffect } from 'react'
import apiClient from '@/api/client'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import type { User } from '@/types'

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6']
function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

interface Props { onClose: () => void }

export default function CreateRoomModal({ onClose }: Props) {
  const [tab, setTab] = useState<'room' | 'dm'>('room')
  const [roomName, setRoomName] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const { fetchRooms, fetchDmRooms, setActiveRoom } = useChatStore()
  const currentUser = useAuthStore((s) => s.user)

  useEffect(() => {
    if (tab === 'dm') apiClient.get<User[]>('/users').then((res) => setUsers(res.data))
  }, [tab])

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomName.trim()) return
    setLoading(true)
    try {
      const { data } = await apiClient.post('/rooms', { name: roomName.trim() })
      await fetchRooms()
      setActiveRoom(data.id)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const handleCreateDM = async (targetId: string) => {
    setLoading(true)
    try {
      const { data } = await apiClient.post('/rooms/dm', { target_user_id: targetId })
      await fetchDmRooms()
      setActiveRoom(data.id)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.tabs}>
          <button
            onClick={() => setTab('room')}
            style={{ ...styles.tab, borderBottom: tab === 'room' ? '2px solid #4f46e5' : '2px solid transparent', color: tab === 'room' ? '#4f46e5' : 'var(--text-muted)' }}
          >
            그룹방 만들기
          </button>
          <button
            onClick={() => setTab('dm')}
            style={{ ...styles.tab, borderBottom: tab === 'dm' ? '2px solid #4f46e5' : '2px solid transparent', color: tab === 'dm' ? '#4f46e5' : 'var(--text-muted)' }}
          >
            DM 시작
          </button>
        </div>

        {tab === 'room' ? (
          <form onSubmit={handleCreateRoom} style={styles.form}>
            <input
              type="text"
              placeholder="방 이름"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              style={styles.input}
              autoFocus
            />
            <button type="submit" disabled={loading || !roomName.trim()} style={styles.button}>만들기</button>
          </form>
        ) : (
          <div style={styles.userList}>
            {users.filter((u) => u.id !== currentUser?.id).map((u) => (
              <button key={u.id} onClick={() => handleCreateDM(u.id)} style={styles.userItem}>
                <span style={{ ...styles.avatar, background: avatarColor(u.username) }}>
                  {u.username[0].toUpperCase()}
                </span>
                <span style={styles.userName}>{u.username}</span>
              </button>
            ))}
            {users.length === 0 && <p style={styles.empty}>다른 유저가 없습니다.</p>}
          </div>
        )}
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
  tabs: { display: 'flex', gap: '1rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: 0 },
  tab: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '0.9rem', padding: '0.25rem 0', fontWeight: 600,
    marginBottom: '-1px',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  input: {
    padding: '0.65rem 0.875rem', borderRadius: 8,
    border: '1.5px solid var(--border)', fontSize: '0.9rem',
    color: 'var(--text-primary)', background: 'var(--bg-input)', outline: 'none',
  },
  button: {
    padding: '0.65rem', background: '#4f46e5', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
  },
  userList: { display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: 240, overflowY: 'auto' },
  userItem: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.6rem 0.5rem', border: 'none', background: 'none',
    borderRadius: 8, cursor: 'pointer', textAlign: 'left', width: '100%',
  },
  avatar: {
    width: 32, height: 32, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0,
  },
  userName: { fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 },
  empty: { color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 },
}

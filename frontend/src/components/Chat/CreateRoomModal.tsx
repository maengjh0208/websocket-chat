import { useState, useEffect } from 'react'
import apiClient from '@/api/client'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import type { User } from '@/types'

interface Props {
  onClose: () => void
}

export default function CreateRoomModal({ onClose }: Props) {
  const [tab, setTab] = useState<'room' | 'dm'>('room')
  const [roomName, setRoomName] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const { fetchRooms, setActiveRoom } = useChatStore()
  const currentUser = useAuthStore((s) => s.user)

  useEffect(() => {
    if (tab === 'dm') {
      apiClient.get<User[]>('/users').then((res) => setUsers(res.data))
    }
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
      await fetchRooms()
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
            style={{ ...styles.tab, borderBottom: tab === 'room' ? '2px solid #4f46e5' : 'none' }}
          >
            채팅방 만들기
          </button>
          <button
            onClick={() => setTab('dm')}
            style={{ ...styles.tab, borderBottom: tab === 'dm' ? '2px solid #4f46e5' : 'none' }}
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
            <button type="submit" disabled={loading || !roomName.trim()} style={styles.button}>
              만들기
            </button>
          </form>
        ) : (
          <div style={styles.userList}>
            {users
              .filter((u) => u.id !== currentUser?.id)
              .map((u) => (
                <button key={u.id} onClick={() => handleCreateDM(u.id)} style={styles.userItem}>
                  <span style={styles.avatar}>{u.username[0].toUpperCase()}</span>
                  <span>{u.username}</span>
                </button>
              ))}
            {users.length === 0 && <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>다른 유저가 없습니다.</p>}
          </div>
        )}
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
  tabs: { display: 'flex', gap: '1rem', marginBottom: '1.25rem' },
  tab: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '0.95rem', padding: '0.25rem 0', color: '#374151',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  input: {
    padding: '0.6rem 0.8rem', borderRadius: 6,
    border: '1px solid #ddd', fontSize: '1rem',
  },
  button: {
    padding: '0.65rem', background: '#4f46e5', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: '0.95rem', cursor: 'pointer',
  },
  userList: { display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 240, overflowY: 'auto' },
  userItem: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.6rem', border: 'none', background: 'none',
    borderRadius: 6, cursor: 'pointer', textAlign: 'left',
    fontSize: '0.95rem',
  },
  avatar: {
    width: 32, height: 32, borderRadius: '50%', background: '#e0e7ff',
    color: '#4f46e5', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 600, fontSize: '0.85rem',
    flexShrink: 0,
  },
}

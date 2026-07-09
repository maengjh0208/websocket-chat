import { useEffect, useState } from 'react'
import apiClient from '@/api/client'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import CreateRoomModal from './CreateRoomModal'
import type { Room, User } from '@/types'

interface Props {
  onSelectRoom: (roomId: string) => void
  activeRoomId: string | null
}

export default function Sidebar({ onSelectRoom, activeRoomId }: Props) {
  const { rooms, online, fetchRooms, leaveRoom } = useChatStore()
  const { user, logout } = useAuthStore()
  const [showModal, setShowModal] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null)

  useEffect(() => {
    fetchRooms()
    apiClient.get<User[]>('/users').then((res) => setUsers(res.data))
  }, [fetchRooms])

  const getRoomLabel = (room: Room) => {
    if (!room.is_dm) return room.name
    return room.name
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.me}>
          <span style={styles.onlineDot} />
          <span style={styles.username}>{user?.username}</span>
        </div>
        <button onClick={logout} style={styles.logoutBtn}>로그아웃</button>
      </div>

      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>채팅방</span>
        <button onClick={() => setShowModal(true)} style={styles.addBtn} title="새 채팅방 / DM">
          +
        </button>
      </div>

      <div style={styles.roomList}>
        {rooms.map((room: Room) => (
          <div
            key={room.id}
            style={styles.roomWrapper}
            onMouseEnter={() => setHoveredRoomId(room.id)}
            onMouseLeave={() => setHoveredRoomId(null)}
          >
            <button
              onClick={() => onSelectRoom(room.id)}
              style={{
                ...styles.roomItem,
                background: room.id === activeRoomId ? '#e0e7ff' : 'transparent',
              }}
            >
              <span style={styles.roomIcon}>{room.is_dm ? '👤' : '#'}</span>
              <span style={styles.roomName}>{getRoomLabel(room)}</span>
            </button>
            {hoveredRoomId === room.id && (
              <button
                onClick={() => leaveRoom(room.id)}
                style={styles.leaveBtn}
                title="방 나가기"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {rooms.length === 0 && (
          <p style={styles.empty}>+ 버튼으로 방을 만들어보세요.</p>
        )}
      </div>

      <div style={styles.divider} />

      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>유저</span>
      </div>

      <div style={styles.userList}>
        {users.map((u) => {
          const isOnline = online[u.id] === true
          return (
            <div key={u.id} style={styles.userItem}>
              <span style={{ ...styles.statusDot, background: isOnline ? '#22c55e' : '#d1d5db' }} />
              <span style={styles.userName}>{u.username}</span>
            </div>
          )
        })}
        {users.length === 0 && (
          <p style={styles.empty}>다른 유저가 없습니다.</p>
        )}
      </div>

      {showModal && <CreateRoomModal onClose={() => setShowModal(false)} />}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 240,
    borderRight: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    background: '#f9fafb',
  },
  header: {
    padding: '0.875rem 1rem',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  me: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  onlineDot: {
    width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0,
  },
  username: { fontWeight: 600, fontSize: '0.9rem' },
  logoutBtn: {
    background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem',
  },
  sectionHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.6rem 1rem 0.2rem',
  },
  sectionLabel: { fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' },
  addBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '1.1rem', color: '#6b7280', lineHeight: 1, padding: '0 2px',
  },
  divider: { borderTop: '1px solid #e5e7eb', margin: '0.5rem 0' },
  roomList: { overflowY: 'auto', padding: '0.25rem 0.5rem' },
  userList: { flex: 1, overflowY: 'auto', padding: '0.25rem 0.5rem' },
  userItem: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.4rem 0.6rem', borderRadius: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  userName: { fontSize: '0.875rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  roomWrapper: {
    display: 'flex', alignItems: 'center', marginBottom: '0.15rem',
  },
  roomItem: {
    flex: 1, textAlign: 'left', padding: '0.5rem 0.6rem',
    border: 'none', borderRadius: 6, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '0.5rem',
  },
  leaveBtn: {
    flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
    color: '#9ca3af', fontSize: '1rem', padding: '0 4px', lineHeight: 1,
  },
  roomIcon: { fontSize: '0.85rem', flexShrink: 0 },
  roomName: { fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  empty: { color: '#9ca3af', fontSize: '0.8rem', padding: '0.5rem 0.4rem' },
}

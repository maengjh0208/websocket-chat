import { useEffect } from 'react'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import type { Room } from '@/types'

interface Props {
  onSelectRoom: (roomId: string) => void
  activeRoomId: string | null
}

export default function Sidebar({ onSelectRoom, activeRoomId }: Props) {
  const { rooms, online, fetchRooms } = useChatStore()
  const { user, logout } = useAuthStore()

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.username}>{user?.username}</span>
        <button onClick={logout} style={styles.logoutBtn}>나가기</button>
      </div>
      <div style={styles.roomList}>
        {rooms.map((room: Room) => (
          <button
            key={room.id}
            onClick={() => onSelectRoom(room.id)}
            style={{
              ...styles.roomItem,
              background: room.id === activeRoomId ? '#e0e7ff' : 'transparent',
            }}
          >
            <span style={styles.roomName}>{room.name}</span>
          </button>
        ))}
        {rooms.length === 0 && (
          <p style={styles.empty}>참여 중인 방이 없습니다.</p>
        )}
      </div>
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
    padding: '1rem',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  username: { fontWeight: 600, fontSize: '0.95rem' },
  logoutBtn: {
    background: 'none',
    border: 'none',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  roomList: { flex: 1, overflowY: 'auto', padding: '0.5rem' },
  roomItem: {
    width: '100%',
    textAlign: 'left',
    padding: '0.6rem 0.8rem',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.25rem',
  },
  roomName: { fontSize: '0.9rem' },
  empty: { color: '#9ca3af', fontSize: '0.85rem', padding: '0.5rem' },
}

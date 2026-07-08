import { useEffect, useState } from 'react'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import CreateRoomModal from './CreateRoomModal'
import type { Room } from '@/types'

interface Props {
  onSelectRoom: (roomId: string) => void
  activeRoomId: string | null
}

export default function Sidebar({ onSelectRoom, activeRoomId }: Props) {
  const { rooms, online, fetchRooms } = useChatStore()
  const { user, logout } = useAuthStore()
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  const getRoomLabel = (room: Room) => {
    if (!room.is_dm) return room.name
    // DM 방 이름에서 상대방 username 추출 ("dm-{uuid}-{uuid}" 형식)
    return room.name
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.me}>
          <span style={styles.onlineDot} />
          <span style={styles.username}>{user?.username}</span>
        </div>
        <button onClick={logout} style={styles.logoutBtn}>나가기</button>
      </div>

      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>채팅방</span>
        <button onClick={() => setShowModal(true)} style={styles.addBtn} title="새 채팅방 / DM">
          +
        </button>
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
            <span style={styles.roomIcon}>{room.is_dm ? '👤' : '#'}</span>
            <span style={styles.roomName}>{getRoomLabel(room)}</span>
          </button>
        ))}
        {rooms.length === 0 && (
          <p style={styles.empty}>+ 버튼으로 방을 만들어보세요.</p>
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
  roomList: { flex: 1, overflowY: 'auto', padding: '0.25rem 0.5rem' },
  roomItem: {
    width: '100%', textAlign: 'left', padding: '0.5rem 0.6rem',
    border: 'none', borderRadius: 6, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem',
  },
  roomIcon: { fontSize: '0.85rem', flexShrink: 0 },
  roomName: { fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  empty: { color: '#9ca3af', fontSize: '0.8rem', padding: '0.5rem 0.4rem' },
}

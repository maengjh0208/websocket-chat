import { useEffect, useState } from 'react'
import apiClient from '@/api/client'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { useFriendStore } from '@/store/friend'
import CreateRoomModal from './CreateRoomModal'
import type { Room, User } from '@/types'

interface Props {
  onSelectRoom: (roomId: string) => void
  activeRoomId: string | null
}

export default function Sidebar({ onSelectRoom, activeRoomId }: Props) {
  const { rooms, online, fetchRooms, leaveRoom } = useChatStore()
  const { user, logout } = useAuthStore()
  const { friends, pendingRequests, fetchFriends, fetchPendingRequests, sendRequest, acceptRequest, deleteFriend } = useFriendStore()
  const [showModal, setShowModal] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null)

  useEffect(() => {
    fetchRooms()
    apiClient.get<User[]>('/users').then((res) => setUsers(res.data))
    fetchFriends()
    fetchPendingRequests()
  }, [fetchRooms, fetchFriends, fetchPendingRequests])

  const friendIds = new Set(friends.map((f) => f.id))

  const handleSendRequest = async (targetId: string) => {
    try {
      await sendRequest(targetId)
      alert('친구 요청을 보냈습니다.')
    } catch {
      alert('친구 요청 실패 (이미 요청했거나 이미 친구입니다.)')
    }
  }

  const handleAccept = async (requesterId: string) => {
    await acceptRequest(requesterId)
  }

  const handleDeleteFriend = async (friendId: string) => {
    if (!confirm('친구를 삭제할까요?')) return
    await deleteFriend(friendId)
  }

  const getRoomLabel = (room: Room) => room.name

  return (
    <div style={styles.container}>
      {/* 헤더 */}
      <div style={styles.header}>
        <div style={styles.me}>
          <span style={styles.onlineDot} />
          <span style={styles.username}>{user?.username}</span>
        </div>
        <button onClick={logout} style={styles.logoutBtn}>로그아웃</button>
      </div>

      {/* 채팅방 섹션 */}
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

      {/* 친구 섹션 */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>친구</span>
      </div>

      {/* 받은 친구 요청 */}
      {pendingRequests.length > 0 && (
        <div style={styles.pendingBox}>
          <p style={styles.pendingTitle}>📬 받은 친구 요청 ({pendingRequests.length})</p>
          {pendingRequests.map((req) => (
            <div key={req.requester_id} style={styles.pendingItem}>
              <span style={styles.pendingName}>{req.username}</span>
              <button
                onClick={() => handleAccept(req.requester_id)}
                style={styles.acceptBtn}
              >
                수락하기
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 친구 목록 */}
      <div style={styles.friendList}>
        {friends.map((friend) => (
          <div key={friend.id} style={styles.friendItem}>
            <span
              style={{
                ...styles.statusDot,
                background: (online[friend.id] ?? friend.is_online) ? '#22c55e' : '#9ca3af',
              }}
            />
            <span style={styles.friendName}>{friend.username}</span>
            <button
              onClick={() => handleDeleteFriend(friend.id)}
              style={styles.removeFriendBtn}
              title="친구 삭제"
            >
              ×
            </button>
          </div>
        ))}
        {friends.length === 0 && (
          <p style={styles.empty}>친구가 없습니다.</p>
        )}
      </div>

      <div style={styles.divider} />

      {/* 온라인 유저 섹션 */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>유저</span>
      </div>

      <div style={styles.userList}>
        {users
          .filter((u) => online[u.id] === true && u.id !== user?.id)
          .map((u) => (
            <div key={u.id} style={styles.userItem}>
              <span style={{ ...styles.statusDot, background: '#22c55e' }} />
              <span style={styles.userName}>{u.username}</span>
              {!friendIds.has(u.id) && (
                <button
                  onClick={() => handleSendRequest(u.id)}
                  style={styles.addFriendBtn}
                >
                  친구 추가
                </button>
              )}
            </div>
          ))}
        {users.filter((u) => online[u.id] === true && u.id !== user?.id).length === 0 && (
          <p style={styles.empty}>온라인 유저가 없습니다.</p>
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
  pendingBox: {
    margin: '0 0.5rem 0.5rem',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 8,
    padding: '0.5rem 0.6rem',
  },
  pendingTitle: {
    fontSize: '0.75rem', fontWeight: 600, color: '#3b82f6',
    margin: '0 0 0.4rem', padding: 0,
  },
  pendingItem: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.3rem 0', borderRadius: 6,
  },
  pendingName: { flex: 1, fontSize: '0.85rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  acceptBtn: {
    background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4,
    fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: '3px 8px', flexShrink: 0,
  },
  friendList: { overflowY: 'auto', padding: '0.25rem 0.5rem' },
  friendItem: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.4rem 0.6rem', borderRadius: 6,
  },
  friendName: { flex: 1, fontSize: '0.875rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  removeFriendBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#d1d5db', fontSize: '1rem', padding: '0 2px', lineHeight: 1,
    flexShrink: 0,
  },
  userList: { flex: 1, overflowY: 'auto', padding: '0.25rem 0.5rem' },
  userItem: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.4rem 0.6rem', borderRadius: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  userName: { flex: 1, fontSize: '0.875rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  addFriendBtn: {
    background: 'none', border: '1px solid #d1d5db', borderRadius: 4,
    color: '#6b7280', fontSize: '0.7rem', cursor: 'pointer',
    padding: '2px 6px', flexShrink: 0, whiteSpace: 'nowrap',
  },
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

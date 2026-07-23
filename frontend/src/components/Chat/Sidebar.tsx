import { useEffect, useState } from 'react'
import apiClient from '@/api/client'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { useFriendStore } from '@/store/friend'
import { useThemeStore } from '@/store/theme'
import CreateRoomModal from './CreateRoomModal'
import type { Room, DmRoom, User } from '@/types'

interface Props {
  onSelectRoom: (roomId: string) => void
  activeRoomId: string | null
}

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6']

function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function Sidebar({ onSelectRoom, activeRoomId }: Props) {
  const { rooms, dmRooms, online, fetchRooms, fetchDmRooms, leaveRoom } = useChatStore()
  const { user, logout } = useAuthStore()
  const { friends, pendingRequests, fetchFriends, fetchPendingRequests, sendRequest, acceptRequest, deleteFriend } = useFriendStore()
  const { isDark, toggle } = useThemeStore()
  const [showModal, setShowModal] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null)

  useEffect(() => {
    fetchRooms()
    fetchDmRooms()
    apiClient.get<User[]>('/users').then((res) => setUsers(res.data))
    fetchFriends()
    fetchPendingRequests()
  }, [fetchRooms, fetchDmRooms, fetchFriends, fetchPendingRequests])

  const friendIds = new Set(friends.map((f) => f.id))

  const handleSendRequest = async (targetId: string) => {
    try {
      await sendRequest(targetId)
      alert('친구 요청을 보냈습니다.')
    } catch {
      alert('친구 요청 실패 (이미 요청했거나 이미 친구입니다.)')
    }
  }

  const renderRoomItem = (room: Room, label: string, prefix?: React.ReactNode) => (
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
          background: room.id === activeRoomId ? 'var(--room-active-bg)' : 'transparent',
          color: room.id === activeRoomId ? 'var(--room-active-text)' : 'var(--text-secondary)',
        }}
      >
        {prefix}
        <span style={styles.roomName}>{label}</span>
        {room.unread_count > 0 && <span style={styles.unreadBadge}>{room.unread_count > 99 ? '99+' : room.unread_count}</span>}
      </button>
      {hoveredRoomId === room.id && (
        <button onClick={() => leaveRoom(room.id)} style={styles.leaveBtn} title="나가기">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  )

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.me}>
          <div style={{ ...styles.myAvatar, background: avatarColor(user?.username ?? 'u') }}>
            {user?.username[0].toUpperCase()}
          </div>
          <span style={styles.username}>{user?.username}</span>
        </div>
        <button onClick={logout} style={styles.logoutBtn}>로그아웃</button>
      </div>

      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>그룹방</span>
        <button onClick={() => setShowModal(true)} style={styles.addBtn} title="새 그룹방">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div style={styles.roomList}>
        {rooms.map((room: Room) =>
          renderRoomItem(room, room.name, <span style={styles.hashTag}>#</span>)
        )}
        {rooms.length === 0 && <p style={styles.empty}>+ 버튼으로 방을 만들어보세요.</p>}
      </div>

      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>DM</span>
        <button onClick={() => setShowModal(true)} style={styles.addBtn} title="새 DM">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div style={styles.roomList}>
        {dmRooms.map((room: DmRoom) => {
          const name = room.dm_partner.username
          const color = avatarColor(name)
          return renderRoomItem(
            room, name,
            <span style={{ ...styles.dmAvatar, background: color }}>{name[0].toUpperCase()}</span>
          )
        })}
        {dmRooms.length === 0 && <p style={styles.empty}>DM이 없습니다.</p>}
      </div>

      <div style={styles.divider} />

      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>친구</span>
      </div>

      {pendingRequests.length > 0 && (
        <div style={styles.pendingBox}>
          <p style={styles.pendingTitle}>받은 친구 요청 {pendingRequests.length}건</p>
          {pendingRequests.map((req) => (
            <div key={req.requester_id} style={styles.pendingItem}>
              <span style={styles.pendingName}>{req.username}</span>
              <button onClick={() => acceptRequest(req.requester_id)} style={styles.acceptBtn}>수락</button>
            </div>
          ))}
        </div>
      )}

      <div style={styles.friendList}>
        {friends.map((friend) => (
          <div key={friend.id} style={styles.friendItem}>
            <span style={{ ...styles.statusDot, background: (online[friend.id] ?? friend.is_online) ? '#22c55e' : '#d1d5db' }} />
            <span style={styles.friendName}>{friend.username}</span>
            <button onClick={() => { if (confirm('친구를 삭제할까요?')) deleteFriend(friend.id) }} style={styles.removeFriendBtn} title="친구 삭제">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        ))}
        {friends.length === 0 && <p style={styles.empty}>친구가 없습니다.</p>}
      </div>

      <div style={styles.divider} />

      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>온라인 유저</span>
      </div>
      <div style={styles.userList}>
        {users
          .filter((u) => online[u.id] === true && u.id !== user?.id)
          .map((u) => (
            <div key={u.id} style={styles.userItem}>
              <span style={{ ...styles.statusDot, background: '#22c55e' }} />
              <span style={styles.userName}>{u.username}</span>
              {!friendIds.has(u.id) && (
                <button onClick={() => handleSendRequest(u.id)} style={styles.addFriendBtn}>추가</button>
              )}
            </div>
          ))}
        {users.filter((u) => online[u.id] === true && u.id !== user?.id).length === 0 && (
          <p style={styles.empty}>온라인 유저가 없습니다.</p>
        )}
      </div>

      <div style={styles.bottomBar}>
        <button onClick={toggle} style={styles.themeToggleBtn} title={isDark ? '라이트 모드' : '다크 모드'}>
          {isDark ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          <span style={styles.themeToggleLabel}>{isDark ? '라이트 모드' : '다크 모드'}</span>
        </button>
      </div>

      {showModal && <CreateRoomModal onClose={() => setShowModal(false)} />}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 240,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-sidebar)',
    flexShrink: 0,
  },
  header: {
    padding: '0.875rem 1rem',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  me: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  myAvatar: {
    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: '0.75rem', fontWeight: 700,
  },
  username: { fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' },
  logoutBtn: {
    background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
    fontSize: '0.75rem', padding: '0.25rem 0',
  },
  sectionHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.75rem 1rem 0.25rem',
  },
  sectionLabel: {
    fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  addBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '2px',
  },
  divider: { borderTop: '1px solid var(--border)', margin: '0.5rem 0' },
  roomList: { padding: '0.2rem 0.5rem' },
  roomWrapper: { display: 'flex', alignItems: 'center', marginBottom: '0.1rem' },
  roomItem: {
    flex: 1, textAlign: 'left', padding: '0.45rem 0.6rem',
    border: 'none', borderRadius: 6, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '0.5rem',
  },
  hashTag: {
    fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700,
    width: 16, textAlign: 'center', flexShrink: 0,
  },
  dmAvatar: {
    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: '0.65rem', fontWeight: 700,
  },
  roomName: {
    flex: 1, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis',
    whiteSpace: 'nowrap', fontWeight: 500,
  },
  unreadBadge: {
    flexShrink: 0, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
    background: '#ef4444', color: '#fff', fontSize: '0.65rem', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  },
  leaveBtn: {
    flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', padding: '0 4px', lineHeight: 1,
    display: 'flex', alignItems: 'center',
  },
  pendingBox: {
    margin: '0 0.5rem 0.5rem',
    background: 'var(--pending-bg)',
    border: '1px solid var(--pending-border)',
    borderRadius: 8,
    padding: '0.5rem 0.75rem',
  },
  pendingTitle: {
    fontSize: '0.72rem', fontWeight: 700, color: 'var(--pending-text)',
    margin: '0 0 0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  pendingItem: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0' },
  pendingName: { flex: 1, fontSize: '0.85rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  acceptBtn: {
    background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4,
    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: '3px 8px', flexShrink: 0,
  },
  friendList: { padding: '0.2rem 0.5rem' },
  friendItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.6rem', borderRadius: 6 },
  friendName: { flex: 1, fontSize: '0.875rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 },
  removeFriendBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', padding: '0 2px', lineHeight: 1,
    flexShrink: 0, display: 'flex', alignItems: 'center',
  },
  userList: { flex: 1, overflowY: 'auto', padding: '0.2rem 0.5rem' },
  userItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.6rem', borderRadius: 6 },
  statusDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  userName: { flex: 1, fontSize: '0.875rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 },
  addFriendBtn: {
    background: 'none', border: '1px solid var(--border)', borderRadius: 4,
    color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer',
    padding: '2px 7px', flexShrink: 0, whiteSpace: 'nowrap',
  },
  empty: { color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.4rem 0.6rem', margin: 0 },
  bottomBar: {
    borderTop: '1px solid var(--border)',
    padding: '0.6rem 0.75rem',
    marginTop: 'auto',
  },
  themeToggleBtn: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', padding: '0.4rem 0.5rem',
    borderRadius: 6, width: '100%',
  },
  themeToggleLabel: { fontSize: '0.8rem', fontWeight: 500 },
}

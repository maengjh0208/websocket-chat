import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import MessageBubble from './MessageBubble'
import TypingIndicator from './TypingIndicator'
import MessageInput from './MessageInput'
import InviteMemberModal from './InviteMemberModal'
import MemberListModal from './MemberListModal'
import type { DmRoom } from '@/types'

interface Props {
  roomId: string
  onSendMessage: (content: string) => void
  onTypingStart: () => void
  onTypingStop: () => void
  onReadUpdate: () => void
  onBack?: () => void // 모바일에서만 전달됨 — 목록 화면으로 돌아가는 뒤로가기 버튼용
}

// WebSocket 연결 포인트:
// - 방에 입장할 때 read.update push → 서버가 last_read_at 업데이트
// - 새 message.new가 수신되면 addMessage(store)를 통해 자동으로 목록에 추가됨
export default function ChatWindow({ roomId, onSendMessage, onTypingStart, onTypingStop, onReadUpdate, onBack }: Props) {
  const messages = useChatStore((s) => s.messages[roomId] ?? [])
  const typing = useChatStore((s) => s.typing[roomId] ?? [])
  const hasMore = useChatStore((s) => s.hasMoreMessages[roomId] ?? true)
  const room = useChatStore((s) => [...s.rooms, ...s.dmRooms].find((r) => r.id === roomId))
  // DM방의 room.name은 "dm-{uuid}-{uuid}" 형태의 내부 식별자라 그대로 보여주면 안 되고,
  // 대신 이미 갖고 있는 상대방 정보(dm_partner)의 username을 제목으로 사용.
  // s.rooms에 담긴 항목은 항상 is_dm=false, s.dmRooms에 담긴 항목만 is_dm=true라서
  // is_dm이 true면 실제로는 DmRoom이라고 안전하게 단정할 수 있음
  const roomTitle = room?.is_dm ? (room as DmRoom).dm_partner.username : room?.name ?? ''
  const { fetchMessages, fetchOlderMessages } = useChatStore()
  const { user } = useAuthStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const skipScrollRef = useRef(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showMembers, setShowMembers] = useState(false)

  useEffect(() => {
    setIsLoadingMore(false)
    skipScrollRef.current = false
    fetchMessages(roomId)
    onReadUpdate()

    // cleanup: 다른 방으로 이동하거나(roomId 변경) 방을 완전히 닫을 때(모바일 뒤로가기 등
    // 컴포넌트 언마운트) 실행됨. 방을 나가는 시점에 한 번 더 read.update를 보내서,
    // 방에 머무는 동안 오간 메시지까지 last_read_at에 반영되게 함
    return () => {
      onReadUpdate()
    }
  }, [roomId])

  useEffect(() => {
    if (skipScrollRef.current) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  const handleScroll = async () => {
    const el = listRef.current
    if (!el || isLoadingMore || !hasMore) return
    if (el.scrollTop === 0) {
      setIsLoadingMore(true)
      skipScrollRef.current = true
      const prevHeight = el.scrollHeight
      await fetchOlderMessages(roomId)
      requestAnimationFrame(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight - prevHeight
        }
        skipScrollRef.current = false
        setIsLoadingMore(false)
      })
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          {onBack && (
            <button onClick={onBack} style={styles.backBtn} title="목록으로">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M11 3L5 9l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          <span style={styles.roomPrefix}>{room?.is_dm ? '' : '#'}</span>
          <span style={styles.roomName}>{roomTitle}</span>
        </div>
        <div style={styles.headerActions}>
          <button style={styles.membersBtn} onClick={() => setShowMembers(true)}>멤버</button>
          {!room?.is_dm && (
            <button style={styles.inviteBtn} onClick={() => setShowInvite(true)}>멤버 초대</button>
          )}
        </div>
      </div>

      <div ref={listRef} style={styles.messageList} onScroll={handleScroll}>
        {!hasMore && <p style={styles.noMore}>처음 메시지입니다.</p>}
        {isLoadingMore && <p style={styles.loadingMore}>불러오는 중...</p>}
        {messages.map((msg, i) => {
          const prev = messages[i - 1]
          const dateKey = msg.created_at.slice(0, 10)
          const prevDateKey = prev?.created_at.slice(0, 10) ?? null
          const showSeparator = dateKey !== prevDateKey
          const showHeader = showSeparator || prev?.sender.id !== msg.sender.id
          return (
            <div key={msg.id}>
              {showSeparator && <DateSeparator dateStr={msg.created_at} />}
              <MessageBubble message={msg} isMe={msg.sender.id === user?.id} showHeader={showHeader} />
            </div>
          )
        })}
        <TypingIndicator typingUsers={typing} />
        <div ref={bottomRef} />
      </div>

      <div style={styles.bottom}>
        <MessageInput
          roomId={roomId}
          onSendMessage={onSendMessage}
          onTypingStart={onTypingStart}
          onTypingStop={onTypingStop}
        />
      </div>

      {showInvite && <InviteMemberModal roomId={roomId} onClose={() => setShowInvite(false)} />}
      {showMembers && <MemberListModal roomId={roomId} onClose={() => setShowMembers(false)} />}
    </div>
  )
}

function DateSeparator({ dateStr }: { dateStr: string }) {
  const date = new Date(dateStr)
  const label = date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
  return (
    <div style={sepStyles.wrapper}>
      <div style={sepStyles.line} />
      <span style={sepStyles.label}>{label}</span>
      <div style={sepStyles.line} />
    </div>
  )
}

const sepStyles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0 0.5rem' },
  line: { flex: 1, height: 1, background: 'var(--border)' },
  label: { fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 },
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)',
    flexShrink: 0, background: 'var(--bg-surface)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: 0, overflow: 'hidden' },
  backBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
    padding: '0.25rem', marginRight: '0.25rem', flexShrink: 0,
  },
  roomPrefix: { fontSize: '1rem', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 },
  roomName: {
    fontSize: '0.975rem', fontWeight: 600, color: 'var(--text-primary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  headerActions: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 },
  membersBtn: {
    padding: '0.35rem 0.75rem', background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
    border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem',
    cursor: 'pointer', fontWeight: 500,
  },
  inviteBtn: {
    padding: '0.35rem 0.75rem', background: '#4f46e5', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer', fontWeight: 500,
  },
  messageList: { flex: 1, overflowY: 'auto', padding: '1rem', background: 'var(--bg-message-list)' },
  noMore: { textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0 0 0.5rem' },
  loadingMore: { textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0 0 0.5rem' },
  bottom: { flexShrink: 0, background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', padding: '0 1rem' },
}

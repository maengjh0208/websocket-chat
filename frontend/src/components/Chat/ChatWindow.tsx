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
  onReact: (messageId: string, emoji: string) => void
  onBack?: () => void // 모바일에서만 전달됨 — 목록 화면으로 돌아가는 뒤로가기 버튼용
}

// WebSocket 연결 포인트:
// - 방에 입장할 때 read.update push → 서버가 last_read_at 업데이트
// - 새 message.new가 수신되면 addMessage(store)를 통해 자동으로 목록에 추가됨
// - 리액션 pill 클릭 시 onReact → reaction.toggle push, 갱신된 상태는 reaction.update로 돌아와 store가 반영
export default function ChatWindow({ roomId, onSendMessage, onTypingStart, onTypingStop, onReadUpdate, onReact, onBack }: Props) {
  const messages = useChatStore((s) => s.messages[roomId] ?? [])
  const typing = useChatStore((s) => s.typing[roomId] ?? [])
  const hasMore = useChatStore((s) => s.hasMoreMessages[roomId] ?? true)
  const room = useChatStore((s) => [...s.rooms, ...s.dmRooms].find((r) => r.id === roomId))
  const roomMembers = useChatStore((s) => s.roomMembers[roomId] ?? [])
  const allowedReactions = useChatStore((s) => s.allowedReactions)
  // DM방의 room.name은 "dm-{uuid}-{uuid}" 형태의 내부 식별자라 그대로 보여주면 안 되고,
  // 대신 이미 갖고 있는 상대방 정보(dm_partner)의 username을 제목으로 사용.
  // s.rooms에 담긴 항목은 항상 is_dm=false, s.dmRooms에 담긴 항목만 is_dm=true라서
  // is_dm이 true면 실제로는 DmRoom이라고 안전하게 단정할 수 있음
  const roomTitle = room?.is_dm ? (room as DmRoom).dm_partner.username : room?.name ?? ''
  const { fetchMessages, fetchOlderMessages, fetchRoomMembers } = useChatStore()
  const { user } = useAuthStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const skipScrollRef = useRef(false)
  const prevMessageCountRef = useRef(0)
  // 스크롤 위치를 매번 리렌더링 없이 읽기만 하면 되는 값이라 state가 아니라 ref로 들고 있음
  // (state로 하면 스크롤 이벤트마다 리렌더링이 발생함)
  const isAtBottomRef = useRef(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [hasNewMessage, setHasNewMessage] = useState(false)

  useEffect(() => {
    setIsLoadingMore(false)
    skipScrollRef.current = false
    prevMessageCountRef.current = 0 // 방을 옮기면 이전 방의 메시지 개수와 비교하면 안 되므로 리셋
    isAtBottomRef.current = true // 방에 새로 들어가면 항상 맨 아래(최신 메시지)부터 봄
    setHasNewMessage(false)
    fetchMessages(roomId)
    // 리액션 "누가 반응했는지" 툴팁에서 user_id → username을 바로 찾을 수 있도록,
    // 멤버 목록 모달을 열 때까지 기다리지 않고 방 입장 시점에 미리 받아둠
    fetchRoomMembers(roomId)
    onReadUpdate()

    // cleanup: 다른 방으로 이동하거나(roomId 변경) 방을 완전히 닫을 때(모바일 뒤로가기 등
    // 컴포넌트 언마운트) 실행됨. 방을 나가는 시점에 한 번 더 read.update를 보내서,
    // 방에 머무는 동안 오간 메시지까지 last_read_at에 반영되게 함
    return () => {
      onReadUpdate()
    }
  }, [roomId])

  useEffect(() => {
    // 리액션 토글처럼 배열 내용만 바뀌고 개수는 그대로인 경우엔 스크롤하면 안 되므로,
    // "참조가 바뀌었는지"가 아니라 "실제로 메시지가 늘었는지"로 새 메시지 도착 여부를 판단함
    const isNewMessage = messages.length > prevMessageCountRef.current
    prevMessageCountRef.current = messages.length

    if (skipScrollRef.current || !isNewMessage) return

    // 이미 맨 아래를 보고 있었다면 그대로 따라가서 스크롤, 옛날 메시지를 읽던 중이었다면
    // 화면을 건드리지 않고 대신 "새 메시지" 배너만 띄움 (아래 hasNewMessage)
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      setHasNewMessage(true)
    }
  }, [messages])
  // 타이핑 인디케이터가 뜨고 사라지는 것만으로는 더 이상 스크롤하지 않음
  // (옛날 메시지를 읽던 중에 누가 타이핑을 시작했다고 화면이 끌려 내려가면 안 되므로)

  const handleScroll = async () => {
    const el = listRef.current
    if (!el) return

    // 맨 아래 근처(80px 이내)인지를 매 스크롤마다 갱신. 맨 아래로 돌아오면 "새 메시지" 배너도 치움
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isAtBottomRef.current = distanceFromBottom < 80
    if (isAtBottomRef.current) setHasNewMessage(false)

    if (isLoadingMore || !hasMore) return
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

  const handleJumpToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setHasNewMessage(false)
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

      <div style={styles.messageListWrapper}>
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
                <MessageBubble
                  message={msg}
                  isMe={msg.sender.id === user?.id}
                  showHeader={showHeader}
                  currentUserId={user?.id}
                  allowedReactions={allowedReactions}
                  roomMembers={roomMembers}
                  onReact={onReact}
                />
              </div>
            )
          })}
          <TypingIndicator typingUsers={typing} />
          <div ref={bottomRef} />
        </div>
        {hasNewMessage && (
          <button type="button" style={styles.newMessageBanner} onClick={handleJumpToBottom}>
            ↓ 새 메시지가 있습니다
          </button>
        )}
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
  messageListWrapper: { position: 'relative', flex: 1, minHeight: 0, display: 'flex' },
  messageList: { flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '1rem', background: 'var(--bg-message-list)' },
  newMessageBanner: {
    position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
    padding: '0.45rem 0.9rem', borderRadius: 20,
    background: '#4f46e5', color: '#fff', border: 'none',
    fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
    boxShadow: 'var(--shadow-modal)', zIndex: 10,
  },
  noMore: { textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0 0 0.5rem' },
  loadingMore: { textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0 0 0.5rem' },
  bottom: { flexShrink: 0, background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', padding: '0 1rem' },
}

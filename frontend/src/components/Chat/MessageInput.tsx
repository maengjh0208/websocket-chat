import { useState, useRef, useCallback } from 'react'

interface Props {
  roomId: string
  onSendMessage: (content: string) => void
  onTypingStart: () => void
  onTypingStop: () => void
}

// WebSocket 연결 포인트:
// - 사용자가 입력할 때마다 typing.start를 서버에 push
// - 500ms 동안 입력이 없으면 typing.stop push
// - 전송 시 message.send push
export default function MessageInput({ roomId, onSendMessage, onTypingStart, onTypingStop }: Props) {
  const [content, setContent] = useState('')
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setContent(e.target.value)

      if (!isTypingRef.current) {
        isTypingRef.current = true
        onTypingStart()
      }

      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => {
        isTypingRef.current = false
        onTypingStop()
      }, 500)
    },
    [onTypingStart, onTypingStop],
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = content.trim()
      if (!trimmed) return

      onSendMessage(trimmed)
      setContent('')

      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (isTypingRef.current) {
        isTypingRef.current = false
        onTypingStop()
      }
    },
    [content, onSendMessage, onTypingStop],
  )

  const canSend = content.trim().length > 0

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.inputWrapper}>
        <input
          type="text"
          placeholder="메시지를 입력하세요..."
          value={content}
          onChange={handleChange}
          style={styles.input}
          autoComplete="off"
        />
        <button type="submit" disabled={!canSend} style={{ ...styles.sendBtn, opacity: canSend ? 1 : 0.4 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  form: { padding: '0.75rem 1rem 1rem' },
  inputWrapper: {
    display: 'flex', alignItems: 'center',
    background: 'var(--bg-input)',
    borderRadius: 24,
    padding: '0.3rem 0.3rem 0.3rem 1rem',
    border: '1.5px solid var(--border)',
  },
  input: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    fontSize: '0.9rem',
    color: 'var(--text-primary)',
    padding: '0.35rem 0',
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', flexShrink: 0,
  },
}

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
        onTypingStart() // → ws.send({ type: 'typing.start', room_id })
      }

      // 기존 타이머 초기화 후 500ms 뒤에 typing.stop 전송
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => {
        isTypingRef.current = false
        onTypingStop() // → ws.send({ type: 'typing.stop', room_id })
      }, 500)
    },
    [onTypingStart, onTypingStop],
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = content.trim()
      if (!trimmed) return

      onSendMessage(trimmed) // → ws.send({ type: 'message.send', room_id, content })
      setContent('')

      // 전송 후 타이핑 상태 초기화
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (isTypingRef.current) {
        isTypingRef.current = false
        onTypingStop()
      }
    },
    [content, onSendMessage, onTypingStop],
  )

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <input
        type="text"
        placeholder="메시지를 입력하세요..."
        value={content}
        onChange={handleChange}
        style={styles.input}
        autoComplete="off"
      />
      <button type="submit" disabled={!content.trim()} style={styles.button}>
        전송
      </button>
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  form: { display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem', borderTop: '1px solid #e5e7eb' },
  input: {
    flex: 1,
    padding: '0.6rem 0.8rem',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: '0.95rem',
  },
  button: {
    padding: '0.6rem 1.2rem',
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: '0.95rem',
  },
}

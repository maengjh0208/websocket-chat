interface Props {
  typingUsers: string[]
}

export default function TypingIndicator({ typingUsers }: Props) {
  const visible = typingUsers.length > 0

  return (
    <div style={{ ...styles.wrapper, visibility: visible ? 'visible' : 'hidden' }}>
      <div style={styles.bubble}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              ...styles.dot,
              animation: visible
                ? `typing-bounce 1.2s ease-in-out ${i * 0.2}s infinite`
                : 'none',
            }}
          />
        ))}
      </div>
      <span style={styles.label}>
        {typingUsers.length === 1
          ? `${typingUsers[0]}님이 입력 중`
          : `${typingUsers.join(', ')}님이 입력 중`}
      </span>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 0 0.5rem',
  },
  bubble: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: 'var(--bubble-other-bg)',
    border: '1px solid var(--bubble-other-border)',
    borderRadius: '12px 12px 12px 4px',
    padding: '8px 12px',
    boxShadow: 'var(--shadow-bubble)',
  },
  dot: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--text-muted)',
  },
  label: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
}

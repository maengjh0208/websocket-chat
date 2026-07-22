interface Props {
  typingUsers: string[]
}

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6']

function avatarColor(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function TypingIndicator({ typingUsers }: Props) {
  if (typingUsers.length === 0) return null

  return (
    <>
      {typingUsers.map((username) => (
        <div key={username} style={styles.row}>
          <div style={{ ...styles.avatar, background: avatarColor(username) }}>
            {username[0].toUpperCase()}
          </div>
          <div style={styles.group}>
            <span style={styles.name}>{username}</span>
            <div style={styles.bubble}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    ...styles.dot,
                    animation: `typing-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    marginTop: '0.75rem',
  },
  avatar: {
    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: '0.8rem', fontWeight: 700,
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  name: {
    fontSize: '0.72rem',
    color: 'var(--text-muted)',
    fontWeight: 600,
    marginBottom: '0.25rem',
    paddingLeft: '0.25rem',
  },
  bubble: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: 'var(--bubble-other-bg)',
    border: '1px solid var(--bubble-other-border)',
    borderRadius: '4px 16px 16px 16px',
    padding: '0.55rem 0.9rem',
    boxShadow: 'var(--shadow-bubble)',
  },
  dot: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--text-muted)',
  },
}

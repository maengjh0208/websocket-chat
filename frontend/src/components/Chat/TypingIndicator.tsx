interface Props {
  typingUsers: string[]
}

export default function TypingIndicator({ typingUsers }: Props) {
  if (typingUsers.length === 0) return null

  const label =
    typingUsers.length === 1
      ? `${typingUsers[0]}님이 입력 중...`
      : `${typingUsers.join(', ')}님이 입력 중...`

  return <p style={styles.text}>{label}</p>
}

const styles: Record<string, React.CSSProperties> = {
  text: { fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0', height: '1.2rem' },
}

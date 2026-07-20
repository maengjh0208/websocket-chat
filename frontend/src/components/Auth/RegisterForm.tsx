import { useState } from 'react'
import { useAuthStore } from '@/store/auth'

interface Props {
  onSwitchToLogin: () => void
}

export default function RegisterForm({ onSwitchToLogin }: Props) {
  const register = useAuthStore((s) => s.register)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(username, email, password)
      setDone(true)
    } catch {
      setError('회원가입에 실패했습니다. 이미 사용 중인 이메일일 수 있습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div style={styles.card}>
        <div style={styles.brand}>
          <div style={styles.brandMark} />
          <span style={styles.brandName}>Chat</span>
        </div>
        <h2 style={styles.title}>가입 완료</h2>
        <p style={styles.subtitle}>이제 로그인할 수 있습니다.</p>
        <button onClick={onSwitchToLogin} style={{ ...styles.button, marginTop: '0.5rem' }}>
          로그인하러 가기
        </button>
      </div>
    )
  }

  return (
    <div style={styles.card}>
      <div style={styles.brand}>
        <div style={styles.brandMark} />
        <span style={styles.brandName}>Chat</span>
      </div>
      <h2 style={styles.title}>회원가입</h2>
      <p style={styles.subtitle}>새 계정을 만들어보세요.</p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.field}>
          <label style={styles.label}>유저네임</label>
          <input
            type="text"
            placeholder="홍길동"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={styles.input}
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>이메일</label>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>비밀번호</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
          />
        </div>
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? '가입 중...' : '회원가입'}
        </button>
      </form>

      <p style={styles.switch}>
        이미 계정이 있으신가요?{' '}
        <button onClick={onSwitchToLogin} style={styles.link}>로그인</button>
      </p>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--bg-surface)',
    borderRadius: 16,
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: 380,
    boxShadow: 'var(--shadow-card)',
  },
  brand: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.75rem' },
  brandMark: { width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #4f46e5)' },
  brandName: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' },
  title: { fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.25rem', letterSpacing: '-0.02em' },
  subtitle: { fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0 0 1.75rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  label: { fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' },
  input: {
    padding: '0.65rem 0.875rem',
    borderRadius: 8,
    border: '1.5px solid var(--border)',
    fontSize: '0.9rem',
    color: 'var(--text-primary)',
    background: 'var(--bg-input)',
    outline: 'none',
  },
  button: {
    marginTop: '0.25rem',
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  error: { color: '#dc2626', fontSize: '0.8rem', margin: 0 },
  switch: { marginTop: '1.25rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' },
  link: { background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', padding: 0, fontWeight: 600, fontSize: '0.85rem' },
}

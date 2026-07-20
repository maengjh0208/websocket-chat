import { useState } from 'react'
import { useAuthStore } from '@/store/auth'

interface Props {
  onSwitchToRegister: () => void
}

export default function LoginForm({ onSwitchToRegister }: Props) {
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.brand}>
        <div style={styles.brandMark} />
        <span style={styles.brandName}>Chat</span>
      </div>
      <h2 style={styles.title}>로그인</h2>
      <p style={styles.subtitle}>계속하려면 로그인하세요.</p>

      <form onSubmit={handleSubmit} style={styles.form}>
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
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>

      <p style={styles.switch}>
        계정이 없으신가요?{' '}
        <button onClick={onSwitchToRegister} style={styles.link}>회원가입</button>
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
  },
  error: { color: '#dc2626', fontSize: '0.8rem', margin: 0 },
  switch: { marginTop: '1.25rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' },
  link: { background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', padding: 0, fontWeight: 600, fontSize: '0.85rem' },
}

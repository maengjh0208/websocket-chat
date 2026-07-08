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
      <h2 style={styles.title}>로그인</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={styles.input}
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={styles.input}
        />
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
      <p style={styles.switch}>
        계정이 없으신가요?{' '}
        <button onClick={onSwitchToRegister} style={styles.link}>
          회원가입
        </button>
      </p>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    borderRadius: 8,
    padding: '2rem',
    width: 360,
    boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
  },
  title: { marginBottom: '1.5rem', fontSize: '1.4rem', textAlign: 'center' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  input: {
    padding: '0.6rem 0.8rem',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: '1rem',
  },
  button: {
    marginTop: '0.5rem',
    padding: '0.7rem',
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: '1rem',
    cursor: 'pointer',
  },
  error: { color: '#dc2626', fontSize: '0.875rem', margin: 0 },
  switch: { marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem' },
  link: { background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', padding: 0 },
}

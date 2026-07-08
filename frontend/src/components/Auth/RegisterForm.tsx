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
        <h2 style={styles.title}>가입 완료!</h2>
        <p style={{ textAlign: 'center', color: '#16a34a' }}>이제 로그인하세요.</p>
        <button onClick={onSwitchToLogin} style={{ ...styles.button, marginTop: '1rem' }}>
          로그인하러 가기
        </button>
      </div>
    )
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>회원가입</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="text"
          placeholder="유저네임"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          style={styles.input}
        />
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
          {loading ? '가입 중...' : '회원가입'}
        </button>
      </form>
      <p style={styles.switch}>
        이미 계정이 있으신가요?{' '}
        <button onClick={onSwitchToLogin} style={styles.link}>
          로그인
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
    width: '100%',
  },
  error: { color: '#dc2626', fontSize: '0.875rem', margin: 0 },
  switch: { marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem' },
  link: { background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', padding: 0 },
}

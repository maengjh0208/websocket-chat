import { useState } from 'react'
import { useAuthStore } from '@/store/auth'
import LoginForm from '@/components/auth/LoginForm'
import RegisterForm from '@/components/auth/RegisterForm'

export default function App() {
  const { isAuthenticated, user, logout } = useAuthStore()
  const [view, setView] = useState<'login' | 'register'>('login')

  if (isAuthenticated) {
    return (
      <div style={styles.center}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
            안녕하세요, <strong>{user?.username}</strong>님!
          </p>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
            채팅 UI는 Task 10에서 추가됩니다.
          </p>
          <button onClick={logout} style={styles.logoutButton}>
            로그아웃
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.center}>
      {view === 'login' ? (
        <LoginForm onSwitchToRegister={() => setView('register')} />
      ) : (
        <RegisterForm onSwitchToLogin={() => setView('login')} />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  center: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f3f4f6',
  },
  logoutButton: {
    padding: '0.6rem 1.2rem',
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: '1rem',
    cursor: 'pointer',
  },
}

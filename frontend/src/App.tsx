import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import LoginForm from '@/components/Auth/LoginForm'
import RegisterForm from '@/components/Auth/RegisterForm'
import ChatLayout from '@/components/Chat/ChatLayout'

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const initUser = useAuthStore((s) => s.initUser)
  const [view, setView] = useState<'login' | 'register'>('login')

  useEffect(() => {
    initUser()
  }, [])

  if (isAuthenticated) {
    return <ChatLayout />
  }

  return (
    <div style={styles.bg}>
      <div style={styles.center}>
        {view === 'login' ? (
          <LoginForm onSwitchToRegister={() => setView('register')} />
        ) : (
          <RegisterForm onSwitchToLogin={() => setView('login')} />
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bg: {
    minHeight: '100vh',
    background: 'var(--bg-auth)',
  },
  center: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  },
}

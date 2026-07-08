import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import LoginForm from '@/components/auth/LoginForm'
import RegisterForm from '@/components/auth/RegisterForm'
import ChatLayout from '@/components/chat/ChatLayout'

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const initUser = useAuthStore((s) => s.initUser)
  const [view, setView] = useState<'login' | 'register'>('login')

  // 새로고침 시 localStorage 토큰으로 유저 정보 복원
  useEffect(() => {
    initUser()
  }, [])

  if (isAuthenticated) {
    return <ChatLayout />
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
}

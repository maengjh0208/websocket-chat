import { create } from 'zustand'
import apiClient from '@/api/client'
import type { User, AuthTokens } from '@/types'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean

  login: (email: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('access_token'),
  isAuthenticated: !!localStorage.getItem('access_token'),

  login: async (email, password) => {
    const { data } = await apiClient.post<AuthTokens>('/auth/login', { email, password })
    localStorage.setItem('access_token', data.access_token)

    const { data: user } = await apiClient.get<User>('/users/me')
    set({ token: data.access_token, user, isAuthenticated: true })
  },

  register: async (username, email, password) => {
    await apiClient.post('/auth/register', { username, email, password })
  },

  logout: () => {
    localStorage.removeItem('access_token')
    set({ user: null, token: null, isAuthenticated: false })
  },
}))

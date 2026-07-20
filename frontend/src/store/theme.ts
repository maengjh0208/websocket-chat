import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  isDark: boolean
  toggle: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      isDark: false,
      toggle: () => {
        const next = !get().isDark
        document.documentElement.dataset.theme = next ? 'dark' : 'light'
        set({ isDark: next })
      },
    }),
    {
      name: 'chat-theme',
      onRehydrateStorage: () => (state) => {
        if (state?.isDark) {
          document.documentElement.dataset.theme = 'dark'
        }
      },
    }
  )
)

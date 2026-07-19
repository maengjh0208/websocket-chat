import { create } from 'zustand'
import apiClient from '@/api/client'
import type { Room, DmRoom, Message, User } from '@/types'

interface TypingState {
  [roomId: string]: string[] // 현재 타이핑 중인 username 목록
}

interface OnlineState {
  [userId: string]: boolean
}

interface ChatState {
  rooms: Room[]
  dmRooms: DmRoom[]
  activeRoomId: string | null
  messages: Record<string, Message[]> // roomId → messages
  typing: TypingState
  online: OnlineState
  roomMembers: Record<string, User[]> // roomId → members

  fetchRooms: () => Promise<void>
  fetchDmRooms: () => Promise<void>
  setActiveRoom: (roomId: string) => void
  fetchMessages: (roomId: string) => Promise<void>
  fetchRoomMembers: (roomId: string) => Promise<void>
  leaveRoom: (roomId: string) => Promise<void>

  // WebSocket 이벤트 수신 시 호출
  addMessage: (message: Message) => void
  setTyping: (roomId: string, username: string, isTyping: boolean) => void
  setOnline: (userId: string, status: 'online' | 'offline') => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  dmRooms: [],
  activeRoomId: null,
  messages: {},
  typing: {},
  online: {},
  roomMembers: {},

  fetchRooms: async () => {
    const { data } = await apiClient.get<Room[]>('/rooms')
    set({ rooms: data })
  },

  fetchDmRooms: async () => {
    const { data } = await apiClient.get<DmRoom[]>('/rooms/dm')
    set({ dmRooms: data })
  },

  setActiveRoom: (roomId) => {
    set({ activeRoomId: roomId })
  },

  fetchMessages: async (roomId) => {
    const { data } = await apiClient.get<Message[]>(`/rooms/${roomId}/messages`)
    set((state) => ({
      messages: { ...state.messages, [roomId]: data },
    }))
  },

  fetchRoomMembers: async (roomId) => {
    const { data } = await apiClient.get<User[]>(`/rooms/${roomId}/members`)
    set((state) => ({
      roomMembers: { ...state.roomMembers, [roomId]: data },
    }))
  },

  addMessage: (message) => {
    set((state) => {
      const existing = state.messages[message.room_id] ?? []
      return {
        messages: {
          ...state.messages,
          [message.room_id]: [...existing, message],
        },
      }
    })
  },

  setTyping: (roomId, username, isTyping) => {
    set((state) => {
      const current = state.typing[roomId] ?? []
      const updated = isTyping
        ? current.includes(username) ? current : [...current, username]
        : current.filter((u) => u !== username)
      return { typing: { ...state.typing, [roomId]: updated } }
    })
  },

  setOnline: (userId, status) => {
    set((state) => ({
      online: { ...state.online, [userId]: status === 'online' },
    }))
  },

  leaveRoom: async (roomId) => {
    await apiClient.delete(`/rooms/${roomId}/members/me`)
    set((state) => ({
      rooms: state.rooms.filter((r) => r.id !== roomId),
      dmRooms: state.dmRooms.filter((r) => r.id !== roomId),
      activeRoomId: state.activeRoomId === roomId ? null : state.activeRoomId,
      messages: Object.fromEntries(Object.entries(state.messages).filter(([id]) => id !== roomId)),
    }))
  },
}))

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
  hasMoreMessages: Record<string, boolean> // roomId → 더 불러올 메시지 있는지
  typing: TypingState
  online: OnlineState
  roomMembers: Record<string, User[]> // roomId → members

  fetchRooms: () => Promise<void>
  fetchDmRooms: () => Promise<void>
  setActiveRoom: (roomId: string | null) => void
  incrementUnread: (roomId: string) => void
  fetchMessages: (roomId: string) => Promise<void>
  fetchOlderMessages: (roomId: string) => Promise<void>
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
  hasMoreMessages: {},
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
    // 방을 열면 서버에 read.update를 보내는 것과 별개로, 뱃지는 서버 응답을 기다리지 않고 바로 0으로 리셋
    // (열람 자체는 실패할 일이 없는 순수 로컬 상태 전환이라 낙관적으로 처리해도 안전함)
    // roomId가 null이면 "방 닫기" (모바일에서 뒤로가기로 목록 화면으로 돌아갈 때 씀)
    set((state) => ({
      activeRoomId: roomId,
      rooms: roomId ? state.rooms.map((r) => (r.id === roomId ? { ...r, unread_count: 0 } : r)) : state.rooms,
      dmRooms: roomId ? state.dmRooms.map((r) => (r.id === roomId ? { ...r, unread_count: 0 } : r)) : state.dmRooms,
    }))
  },

  incrementUnread: (roomId) => {
    set((state) => ({
      rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, unread_count: r.unread_count + 1 } : r)),
      dmRooms: state.dmRooms.map((r) => (r.id === roomId ? { ...r, unread_count: r.unread_count + 1 } : r)),
    }))
  },

  fetchMessages: async (roomId) => {
    const { data } = await apiClient.get<Message[]>(`/rooms/${roomId}/messages`)
    set((state) => ({
      messages: { ...state.messages, [roomId]: data },
      hasMoreMessages: { ...state.hasMoreMessages, [roomId]: data.length === 50 },
    }))
  },

  fetchOlderMessages: async (roomId) => {
    const existing = get().messages[roomId] ?? []
    if (existing.length === 0) return
    const oldestId = existing[0].id
    const { data } = await apiClient.get<Message[]>(`/rooms/${roomId}/messages`, {
      params: { before_message_id: oldestId },
    })
    set((state) => ({
      messages: { ...state.messages, [roomId]: [...data, ...existing] },
      hasMoreMessages: { ...state.hasMoreMessages, [roomId]: data.length === 50 },
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

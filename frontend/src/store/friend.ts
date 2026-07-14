import { create } from 'zustand'
import apiClient from '@/api/client'
import type { Friend, FriendRequest } from '@/types'

interface FriendState {
  friends: Friend[]
  pendingRequests: FriendRequest[]
  fetchFriends: () => Promise<void>
  fetchPendingRequests: () => Promise<void>
  sendRequest: (targetId: string) => Promise<void>
  acceptRequest: (requesterId: string) => Promise<void>
  deleteFriend: (friendId: string) => Promise<void>
}

export const useFriendStore = create<FriendState>((set) => ({
  friends: [],
  pendingRequests: [],

  fetchFriends: async () => {
    const res = await apiClient.get<Friend[]>('/friends')
    set({ friends: res.data })
  },

  fetchPendingRequests: async () => {
    const res = await apiClient.get<FriendRequest[]>('/friends/requests/received')
    set({ pendingRequests: res.data })
  },

  sendRequest: async (targetId: string) => {
    await apiClient.post('/friends/requests', { target_id: targetId })
  },

  acceptRequest: async (requesterId: string) => {
    await apiClient.post(`/friends/requests/${requesterId}/accept`)
    const [friendsRes, requestsRes] = await Promise.all([
      apiClient.get<Friend[]>('/friends'),
      apiClient.get<FriendRequest[]>('/friends/requests/received'),
    ])
    set({ friends: friendsRes.data, pendingRequests: requestsRes.data })
  },

  deleteFriend: async (friendId: string) => {
    await apiClient.delete(`/friends/${friendId}`)
    set((state) => ({ friends: state.friends.filter((f) => f.id !== friendId) }))
  },
}))

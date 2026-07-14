export interface User {
  id: string
  username: string
  email: string
}

export interface Room {
  id: string
  name: string
  is_dm: boolean
  created_by: string
  created_at: string
}

export interface Message {
  id: string
  room_id: string
  sender: {
    id: string
    username: string
  }
  content: string
  created_at: string
}

// WebSocket 페이로드 타입들

export interface WSMessageNew {
  type: 'message.new'
  id: string
  room_id: string
  sender: { id: string; username: string }
  content: string
  created_at: string
}

export interface WSPresenceUpdate {
  type: 'presence.update'
  user_id: string
  status: 'online' | 'offline'
}

export interface WSTypingIndicator {
  type: 'typing.indicator'
  room_id: string
  username: string
  is_typing: boolean
}

export type WSPayload = WSMessageNew | WSPresenceUpdate | WSTypingIndicator

export interface AuthTokens {
  access_token: string
  token_type: string
}

export interface Friend {
  id: string
  username: string
  is_online: boolean
}

export interface FriendRequest {
  requester_id: string
  username: string
  created_at: string
}

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
  unread_count: number
}

export interface DmRoom extends Room {
  dm_partner: { id: string; username: string }
}

export interface ReactionSummary {
  emoji: string
  user_ids: string[] // count는 .length, 내가 반응했는지는 user_ids.includes(내 id)로 계산
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
  reactions: ReactionSummary[]
}

export interface AllowedReaction {
  emoji: string
  sort_order: number
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

export interface WSFriendRequest {
  type: 'friend.request'
  user_id: string
  username: string
}

export interface WSFriendAccept {
  type: 'friend.accept'
  user_id: string
  username: string
}

export interface WSFriendDelete {
  type: 'friend.delete'
  user_id: string
}

export interface WSRoomInvite {
  type: 'room.invite'
  room_id: string
  room_name: string
  is_dm: boolean
}

export interface WSReactionUpdate {
  type: 'reaction.update'
  message_id: string
  room_id: string
  reactions: ReactionSummary[]
}

export type WSPayload =
  | WSMessageNew
  | WSPresenceUpdate
  | WSTypingIndicator
  | WSFriendRequest
  | WSFriendAccept
  | WSFriendDelete
  | WSRoomInvite
  | WSReactionUpdate

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

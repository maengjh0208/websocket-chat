from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CreateRoomRequest(BaseModel):
    name: str = Field(..., description="채팅방 이름")


class CreateDMRequest(BaseModel):
    target_user_id: UUID = Field(..., description="상대 회원 아이디")


class RoomResponse(BaseModel):
    id: UUID
    name: str
    is_dm: bool
    created_by: UUID
    created_at: datetime


class InviteMemberRequest(BaseModel):
    user_id: UUID

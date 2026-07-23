from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CreateRoomRequest(BaseModel):
    name: str = Field(..., description="채팅방 이름")


class CreateDMRequest(BaseModel):
    target_user_id: UUID = Field(..., description="상대 회원 아이디")


class DmPartnerInfo(BaseModel):
    id: UUID
    username: str


class RoomResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    is_dm: bool
    created_by: UUID
    created_at: datetime
    unread_count: int | None = None


class DmRoomResponse(RoomResponse):
    model_config = ConfigDict(from_attributes=True)

    dm_partner: DmPartnerInfo


class InviteMemberRequest(BaseModel):
    user_id: UUID

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FriendRequest(BaseModel):
    target_id: UUID = Field(..., description="친구 요청을 보낼 user_id")


class FriendRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    requester_id: UUID
    username: str
    created_at: datetime


class FriendResponse(BaseModel):
    id: UUID
    username: str
    is_online: bool

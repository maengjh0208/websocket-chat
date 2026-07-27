from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.user import UserResponse
from app.schemas.reaction import ReactionSummaryResponse


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    room_id: UUID
    sender: UserResponse
    content: str
    created_at: datetime
    reactions: list[ReactionSummaryResponse] = []

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.user import UserResponse


class MessageResponse(BaseModel):
    id: UUID
    room_id: UUID
    sender: UserResponse
    content: str
    created_at: datetime

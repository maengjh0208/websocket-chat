from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.domain.user import UserEntity


@dataclass
class MessageEntity:
    id: UUID
    room_id: UUID
    sender: UserEntity
    content: str
    created_at: datetime

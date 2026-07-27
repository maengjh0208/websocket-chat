from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from app.domain.user import UserEntity
from app.domain.reaction import ReactionSummaryEntity


@dataclass(kw_only=True)
class MessageEntity:
    id: UUID
    room_id: UUID
    sender: UserEntity
    content: str
    created_at: datetime
    reactions: list[ReactionSummaryEntity] = field(default_factory=list)

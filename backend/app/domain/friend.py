from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(kw_only=True)
class FriendEntity:
    requester_id: UUID
    addressee_id: UUID
    status: str
    created_at: datetime


@dataclass(kw_only=True)
class FriendRequestEntity:
    requester_id: UUID
    username: str
    created_at: datetime

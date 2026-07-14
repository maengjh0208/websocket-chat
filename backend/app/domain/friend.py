from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass
class FriendEntity:
    requester_id: UUID
    addressee_id: UUID
    status: str
    created_at: datetime


@dataclass
class FriendRequestEntity:
    requester_id: UUID
    username: str
    created_at: datetime

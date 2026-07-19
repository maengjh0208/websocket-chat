from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.domain.user import UserEntity


@dataclass(kw_only=True)
class RoomEntity:
    id: UUID
    name: str
    is_dm: bool
    created_by: UUID
    created_at: datetime
    dm_partner: UserEntity | None = None

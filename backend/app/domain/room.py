from datetime import datetime
from uuid import UUID


class RoomEntity:
    id: UUID
    name: str
    is_dm: bool
    created_by: UUID
    created_at: datetime

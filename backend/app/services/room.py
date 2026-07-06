from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import room as crud_room
from app.domain.room import RoomEntity


async def get_rooms(user_id: UUID, session: AsyncSession) -> list[RoomEntity]:
    return await crud_room.get_rooms_by_user(session, user_id)


async def create_room(name: str, user_id: UUID, session: AsyncSession) -> RoomEntity:
    return await crud_room.create_room(
        session=session,
        name=name,
        created_by=user_id,
    )


async def create_dm(user_id: UUID, target_id: UUID, session: AsyncSession) -> RoomEntity:
    return await crud_room.create_dm(
        session=session,
        user_id=user_id,
        target_id=target_id,
    )

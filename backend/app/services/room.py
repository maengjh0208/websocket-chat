from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import room as crud_room
from app.domain.room import RoomEntity
from app.core.exceptions import ErrorCode, ForbiddenError
from app.domain.user import UserEntity


async def get_rooms(user_id: UUID, session: AsyncSession) -> list[RoomEntity]:
    return await crud_room.get_rooms_by_user(session, user_id)


async def get_dm_rooms(user_id: UUID, session: AsyncSession) -> list[RoomEntity]:
    return await crud_room.get_dm_rooms_by_user(session, user_id)


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


async def invite_members(user_id: UUID, target_id: UUID, room_id: UUID, session: AsyncSession) -> None:
    if not await crud_room.is_room_member(session=session, user_id=user_id, room_id=room_id):
        raise ForbiddenError(error_code=ErrorCode.NO_INVITATION_PERMISSION)

    if not await crud_room.is_room_member(session=session, user_id=target_id, room_id=room_id):
        await crud_room.add_room_member(session=session, user_id=target_id, room_id=room_id)


async def leave_room(room_id: UUID, user_id: UUID, session: AsyncSession) -> None:
    if not await crud_room.leave_room(session=session, user_id=user_id, room_id=room_id):
        raise ForbiddenError(error_code=ErrorCode.NOT_ROOM_MEMBER)


async def get_room_members(room_id: UUID, user_id: UUID, session: AsyncSession) -> list[UserEntity]:
    if not await crud_room.is_room_member(session=session, user_id=user_id, room_id=room_id):
        raise ForbiddenError(error_code=ErrorCode.NOT_ROOM_MEMBER)

    return await crud_room.get_room_members(session, room_id)

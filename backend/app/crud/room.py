from uuid import UUID

from sqlalchemy import intersect, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Room, RoomMember
from app.domain.room import RoomEntity


async def create_room(session: AsyncSession, name: str, created_by: UUID) -> RoomEntity:
    room = Room(name=name, is_dm=False, created_by=created_by)
    session.add(room)
    await session.flush()

    room_member = RoomMember(room_id=room.id, user_id=created_by)
    session.add(room_member)
    await session.flush()

    return RoomEntity(
        id=room.id,
        name=room.name,
        is_dm=room.is_dm,
        created_by=room.created_by,
        created_at=room.created_at,
    )


async def get_rooms_by_user(session: AsyncSession, user_id: UUID) -> list[RoomEntity]:
    query = select(Room).join(RoomMember, Room.id == RoomMember.room_id).where(RoomMember.user_id == user_id)

    result = await session.execute(query)
    rooms = result.scalars().all()

    return [
        RoomEntity(
            id=room.id,
            name=room.name,
            is_dm=room.is_dm,
            created_by=room.created_by,
            created_at=room.created_at,
        )
        for room in rooms
    ]


async def create_dm(session: AsyncSession, user_id: UUID, target_id: UUID) -> RoomEntity:
    # 기존 dm 방이 있는지 확인 (두 유저가 공통으로 속한 DM 방 조회)
    my_dm_rooms = (
        select(RoomMember.room_id)
        .join(Room, Room.id == RoomMember.room_id)
        .where(RoomMember.user_id == user_id, Room.is_dm == True)
    )

    target_dm_rooms = (
        select(RoomMember.room_id)
        .join(Room, Room.id == RoomMember.room_id)
        .where(RoomMember.user_id == target_id, Room.is_dm == True)
    )

    common = intersect(my_dm_rooms, target_dm_rooms).subquery()  # 교집합

    result = await session.execute(select(Room).where(Room.id.in_(select(common))))
    existing = result.scalar_one_or_none()

    if existing:
        return RoomEntity(
            id=existing.id,
            name=existing.name,
            is_dm=existing.is_dm,
            created_by=existing.created_by,
            created_at=existing.created_at,
        )
    else:  # dm 방 생성
        new_room = Room(name=f"dm-{user_id}-{target_id}", is_dm=True, created_by=user_id)

        session.add(new_room)
        await session.flush()

        room_member_user = RoomMember(room_id=new_room.id, user_id=user_id)
        room_member_target = RoomMember(room_id=new_room.id, user_id=target_id)

        session.add(room_member_user)
        session.add(room_member_target)
        await session.flush()

        return RoomEntity(
            id=new_room.id,
            name=new_room.name,
            is_dm=new_room.is_dm,
            created_by=new_room.created_by,
            created_at=new_room.created_at,
        )


async def is_room_member(session: AsyncSession, user_id: UUID, room_id: UUID) -> bool:
    query = select(RoomMember).where(
        RoomMember.user_id == user_id,
        RoomMember.room_id == room_id,
    )

    result = await session.execute(query)
    row = result.scalar_one_or_none()

    return row is not None


async def get_room_member_ids(session: AsyncSession, room_id: UUID) -> list[UUID]:
    query = select(RoomMember.user_id).where(RoomMember.room_id == room_id)
    result = await session.execute(query)

    return list(result.scalars().all())


async def get_peer_user_ids(session: AsyncSession, user_id: UUID) -> list[UUID]:
    my_rooms = select(RoomMember.room_id).where(RoomMember.user_id == user_id)

    result = await session.execute(
        select(RoomMember.user_id)
        .where(RoomMember.room_id.in_(my_rooms))
        .where(RoomMember.user_id != user_id)
        .distinct()
    )

    return list(result.scalars().all())

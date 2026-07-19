from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import intersect, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Room, RoomMember, User
from app.domain.room import RoomEntity
from app.domain.user import UserEntity


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
    query = (
        select(Room)
        .join(RoomMember, Room.id == RoomMember.room_id)
        .where(
            RoomMember.user_id == user_id,
            RoomMember.left_at.is_(None),
            Room.is_dm == False,
        )
    )

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


async def get_dm_rooms_by_user(session: AsyncSession, user_id: UUID) -> list[RoomEntity]:
    sub_query = (
        select(Room.id)
        .join(RoomMember, RoomMember.room_id == Room.id)
        .where(
            RoomMember.user_id == user_id,
            RoomMember.left_at.is_(None),
            Room.is_dm == True,
        )
    )

    query = (
        select(
            Room.id,
            Room.name,
            Room.is_dm,
            Room.created_by,
            Room.created_at,
            User.id.label("user_id"),
            User.username,
        )
        .join(RoomMember, RoomMember.room_id == Room.id)
        .join(User, User.id == RoomMember.user_id)
        .where(
            RoomMember.user_id != user_id,
            Room.id.in_(sub_query),
        )
    )

    result = await session.execute(query)
    rows = result.all()

    return [
        RoomEntity(
            id=row.id,
            name=row.name,
            is_dm=row.is_dm,
            created_by=row.created_by,
            created_at=row.created_at,
            dm_partner=UserEntity(
                id=row.user_id,
                username=row.username,
            ),
        )
        for row in rows
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
        RoomMember.left_at.is_(None),
    )

    result = await session.execute(query)
    row = result.scalar_one_or_none()

    return row is not None


async def get_room_member_ids(session: AsyncSession, room_id: UUID) -> list[UUID]:
    query = select(RoomMember.user_id).where(
        RoomMember.room_id == room_id,
        RoomMember.left_at.is_(None),
    )
    result = await session.execute(query)

    return list(result.scalars().all())


async def get_room_members(session: AsyncSession, room_id: UUID) -> list[UserEntity]:
    query = (
        select(
            User.id,
            User.username,
            User.email,
            User.created_at,
        )
        .join(RoomMember, RoomMember.user_id == User.id)
        .where(
            RoomMember.room_id == room_id,
            RoomMember.left_at.is_(None),
        )
    )

    result = await session.execute(query)
    users = result.all()

    return [
        UserEntity(
            id=user.id,
            username=user.username,
            email=user.email,
            created_at=user.created_at,
        )
        for user in users
    ]


async def get_peer_user_ids(session: AsyncSession, user_id: UUID) -> list[UUID]:
    my_rooms = select(RoomMember.room_id).where(
        RoomMember.user_id == user_id,
        RoomMember.left_at.is_(None),
    )

    result = await session.execute(
        select(RoomMember.user_id)
        .where(RoomMember.room_id.in_(my_rooms))
        .where(
            RoomMember.user_id != user_id,
            RoomMember.left_at.is_(None),
        )
        .distinct()
    )

    return list(result.scalars().all())


async def update_last_read_at(session: AsyncSession, room_id: UUID, user_id: UUID) -> bool:
    query = (
        update(RoomMember)
        .where(RoomMember.user_id == user_id, RoomMember.room_id == room_id)
        .values(last_read_at=datetime.now(timezone.utc))
    )

    result = await session.execute(query)
    await session.flush()

    return result.rowcount > 0


async def add_room_member(session: AsyncSession, user_id: UUID, room_id: UUID) -> None:
    # 기존에 그룹방을 나갔던 유저는 단순 재참여. 그게 아니면 새로 추가
    result = await session.execute(
        update(RoomMember)
        .where(RoomMember.user_id == user_id, RoomMember.room_id == room_id, RoomMember.left_at.is_not(None))
        .values(left_at=None)
    )
    await session.flush()

    if result.rowcount > 0:
        return
    else:
        room_member = RoomMember(room_id=room_id, user_id=user_id)
        session.add(room_member)
        await session.flush()


async def leave_room(session: AsyncSession, user_id: UUID, room_id: UUID) -> bool:
    query = (
        update(RoomMember)
        .where(RoomMember.user_id == user_id, RoomMember.room_id == room_id, RoomMember.left_at.is_(None))
        .values(left_at=datetime.now(timezone.utc))
    )

    result = await session.execute(query)
    await session.flush()

    return result.rowcount > 0

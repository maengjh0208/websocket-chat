from uuid import UUID

from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Friend, User
from app.domain.friend import FriendEntity, FriendRequestEntity
from app.core.enums import FriendStatus


# 특정 신청 row 조회 (중복/존재 확인용)
async def get_request(session: AsyncSession, requester_id: UUID, addressee_id: UUID) -> FriendEntity | None:
    query = select(
        Friend.requester_id,
        Friend.addressee_id,
        Friend.status,
        Friend.created_at,
    ).where(
        Friend.requester_id == requester_id,
        Friend.addressee_id == addressee_id,
    )

    result = await session.execute(query)
    row = result.one_or_none()

    return (
        FriendEntity(
            requester_id=row.requester_id,
            addressee_id=row.addressee_id,
            status=row.status,
            created_at=row.created_at,
        )
        if row
        else None
    )


# 친구 신청 insert
async def send_request(session: AsyncSession, requester_id: UUID, addressee_id: UUID) -> None:
    friend = Friend(requester_id=requester_id, addressee_id=addressee_id, status=FriendStatus.PENDING)
    session.add(friend)
    await session.flush()


# 내가 받은 대기 중인 신청 목록
async def get_received_requests(session: AsyncSession, user_id: UUID) -> list[FriendRequestEntity]:
    query = (
        select(Friend.requester_id, Friend.created_at, User.username)
        .join(User, Friend.requester_id == User.id)
        .where(
            Friend.addressee_id == user_id,
            Friend.status == FriendStatus.PENDING,
        )
    )

    result = await session.execute(query)
    rows = result.all()

    return [
        FriendRequestEntity(
            requester_id=row.requester_id,
            username=row.username,
            created_at=row.created_at,
        )
        for row in rows
    ]


# 친구 신청 수락 (status -> "accepted")
async def accept_request(session: AsyncSession, requester_id: UUID, addressee_id: UUID) -> bool:
    query = (
        update(Friend)
        .where(
            Friend.requester_id == requester_id,
            Friend.addressee_id == addressee_id,
            Friend.status == FriendStatus.PENDING,
        )
        .values(status=FriendStatus.ACCEPTED)
    )

    result = await session.execute(query)
    await session.flush()
    return result.rowcount > 0


# 수락된 친구 user_id 목록
async def get_friend_ids(session: AsyncSession, user_id: UUID) -> list[UUID]:
    result_1 = await session.execute(
        select(Friend.addressee_id).where(
            Friend.requester_id == user_id,
            Friend.status == FriendStatus.ACCEPTED,
        )
    )

    result_2 = await session.execute(
        select(Friend.requester_id).where(
            Friend.addressee_id == user_id,
            Friend.status == FriendStatus.ACCEPTED,
        )
    )

    return list(result_1.scalars().all()) + list(result_2.scalars().all())


# 친구 삭제 (양방향)
async def delete_friend(session: AsyncSession, user_id: UUID, friend_id: UUID) -> bool:
    query = delete(Friend).where(
        or_(
            (Friend.requester_id == user_id) & (Friend.addressee_id == friend_id),
            (Friend.requester_id == friend_id) & (Friend.addressee_id == user_id),
        )
    )

    result = await session.execute(query)
    await session.flush()
    return result.rowcount > 0

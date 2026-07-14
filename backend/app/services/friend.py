from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ErrorCode, NotFoundError
from app.crud import friend as crud_friend
from app.crud import user as crud_user
from app.domain.friend import FriendEntity, FriendRequestEntity
from app.managers.presence import get_online_peer_ids


async def send_friend_request(user_id: UUID, target_id: UUID, session: AsyncSession) -> None:
    if user_id == target_id:
        raise BadRequestError(error_code=ErrorCode.INVALID_REQUEST)

    if await crud_friend.get_request(session=session, requester_id=user_id, addressee_id=target_id):
        raise BadRequestError(error_code=ErrorCode.FRIEND_REQUEST_EXISTS)

    if await crud_friend.get_request(session=session, requester_id=target_id, addressee_id=user_id):
        raise BadRequestError(error_code=ErrorCode.FRIEND_REQUEST_EXISTS)

    await crud_friend.send_request(session=session, requester_id=user_id, addressee_id=target_id)


async def get_received_friend_requests(user_id: UUID, session: AsyncSession) -> list[FriendRequestEntity]:
    return await crud_friend.get_received_requests(session, user_id)


async def accept_request(user_id: UUID, requester_id: UUID, session: AsyncSession) -> None:
    if user_id == requester_id:
        raise BadRequestError(error_code=ErrorCode.INVALID_REQUEST)

    if not await crud_friend.accept_request(session=session, requester_id=requester_id, addressee_id=user_id):
        raise NotFoundError(error_code=ErrorCode.FRIEND_REQUEST_NOT_FOUND)


async def get_friends(user_id: UUID, session: AsyncSession) -> list[dict]:
    friend_ids = await crud_friend.get_friend_ids(session, user_id)
    if not friend_ids:
        return []

    online_map = await get_online_peer_ids(friend_ids)
    users = await crud_user.get_users_by_ids(session, friend_ids)

    return [
        {
            "id": str(user.id),
            "username": user.username,
            "is_online": online_map.get(
                user.id,
                False,
            ),
        }
        for user in users
    ]


async def delete_friend(user_id: UUID, friend_id: UUID, session: AsyncSession) -> None:
    if user_id == friend_id:
        raise BadRequestError(error_code=ErrorCode.INVALID_REQUEST)

    if not await crud_friend.delete_friend(session=session, user_id=user_id, friend_id=friend_id):
        raise NotFoundError(error_code=ErrorCode.FRIEND_NOT_FOUND)

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.user import UserEntity
from app.api.deps import get_current_user
from app.db.session import get_db
from app.schemas.friend import FriendRequest, FriendRequestResponse, FriendResponse
from app.services import friend as friend_service

router = APIRouter(prefix="/friends", tags=["friends"])


# POST /friends/requests - 친구 요청
@router.post(
    "/requests",
    status_code=status.HTTP_204_NO_CONTENT,
    description="친구 요청",
)
async def send_friend_request(
    body: FriendRequest,
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    await friend_service.send_friend_request(
        user_id=current_user.id,
        target_id=body.target_id,
        session=session,
    )


# GET /friends/requests/received - 친구 요청 목록 조회
@router.get(
    "/requests/received",
    response_model=list[FriendRequestResponse],
    status_code=status.HTTP_200_OK,
    description="친구 요청 목록 조회",
)
async def get_received_friend_requests(
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    return await friend_service.get_received_friend_requests(current_user.id, session)


# POST /friends/requests/{requester_id}/accept - 친구 요청 승인
@router.post(
    "/requests/{requester_id}/accept",
    status_code=status.HTTP_204_NO_CONTENT,
    description="친구 요청 승인",
)
async def accept_friend_request(
    requester_id: UUID,
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    await friend_service.accept_request(
        user_id=current_user.id,
        requester_id=requester_id,
        session=session,
    )


# GET /friends - 친구 목록 조회
@router.get(
    "",
    response_model=list[FriendResponse],
    status_code=status.HTTP_200_OK,
    description="친구 목록 조회",
)
async def get_friends(
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    friends = await friend_service.get_friends(current_user.id, session)

    return [
        FriendResponse(
            id=friend["id"],
            username=friend["username"],
            is_online=friend["is_online"],
        )
        for friend in friends
    ]


# DELETE /friends - 친구 삭제
@router.delete(
    "/{friend_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    description="친구 삭제",
)
async def delete_friend(
    friend_id: UUID,
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    await friend_service.delete_friend(
        user_id=current_user.id,
        friend_id=friend_id,
        session=session,
    )

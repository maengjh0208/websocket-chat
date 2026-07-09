from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from starlette import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.room import CreateDMRequest, CreateRoomRequest, InviteMemberRequest, RoomResponse
from app.domain.user import UserEntity
from app.api.deps import get_current_user
from app.db.session import get_db
from app.services import room as room_service
from app.services import message as message_service
from app.schemas.message import MessageResponse
from app.schemas.user import UserResponse

router = APIRouter(prefix="/rooms")


# GET /rooms - 내가 속한 방 목록 조회
@router.get(
    "",
    response_model=list[RoomResponse],
    status_code=status.HTTP_200_OK,
    description="내가 속한 방 목록 조회",
)
async def get_rooms(
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    rooms = await room_service.get_rooms(current_user.id, session)

    return [
        RoomResponse(
            id=room.id,
            name=room.name,
            is_dm=room.is_dm,
            created_by=room.created_by,
            created_at=room.created_at,
        )
        for room in rooms
    ]


# POST /rooms - 그룹 채팅방 생성
@router.post(
    "",
    response_model=RoomResponse,
    status_code=status.HTTP_201_CREATED,
    description="그룹 채팅방 생성",
)
async def create_room(
    req: CreateRoomRequest,
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    room = await room_service.create_room(
        name=req.name,
        user_id=current_user.id,
        session=session,
    )

    return RoomResponse(
        id=room.id,
        name=room.name,
        is_dm=room.is_dm,
        created_by=room.created_by,
        created_at=room.created_at,
    )


# POST /rooms/dm - DM 방 생성 (또는 기존 DM 방 반환)
@router.post(
    "/dm",
    response_model=RoomResponse,
    status_code=status.HTTP_201_CREATED,
    description="DM 방 생성 (또는 기존 DM 방 반환)",
)
async def create_dm_room(
    req: CreateDMRequest,
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    dm_room = await room_service.create_dm(
        user_id=current_user.id,
        target_id=req.target_user_id,
        session=session,
    )

    return RoomResponse(
        id=dm_room.id,
        name=dm_room.name,
        is_dm=dm_room.is_dm,
        created_by=dm_room.created_by,
        created_at=dm_room.created_at,
    )


# GET /rooms/{room_id}/messages - room_id 방의 메세지 조회
@router.get(
    "/{room_id}/messages",
    response_model=list[MessageResponse],
    status_code=status.HTTP_200_OK,
    description="방 메세지 조회",
)
async def get_messages(
    room_id: UUID,
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    messages = await message_service.get_messages(
        user_id=current_user.id,
        room_id=room_id,
        session=session,
    )

    return [
        MessageResponse(
            id=message.id,
            room_id=message.room_id,
            sender=UserResponse(
                id=message.sender.id,
                username=message.sender.username,
                email=message.sender.email,
                created_at=message.sender.created_at,
            ),
            content=message.content,
            created_at=message.created_at,
        )
        for message in messages
    ]


# POST /rooms/{room_id}/members - 그룹방에 유저 초대
@router.post(
    "/{room_id}/members",
    status_code=status.HTTP_204_NO_CONTENT,
    description="그룹방에 유저 초대",
)
async def invite_members(
    room_id: UUID,
    req: InviteMemberRequest,
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    await room_service.invite_members(
        user_id=current_user.id,
        target_id=req.user_id,
        room_id=room_id,
        session=session,
    )


# DELETE /rooms/{room_id}/members/me - 그룹방에서 나가기
@router.delete(
    "/{room_id}/members/me",
    status_code=status.HTTP_204_NO_CONTENT,
    description="그룹방에서 나가기",
)
async def leave_room(
    room_id: UUID,
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    await room_service.leave_room(
        user_id=current_user.id,
        room_id=room_id,
        session=session,
    )

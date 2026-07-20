from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.room import CreateDMRequest, CreateRoomRequest, DmRoomResponse, InviteMemberRequest, RoomResponse
from app.domain.user import UserEntity
from app.api.deps import get_current_user
from app.db.session import get_db
from app.services import room as room_service
from app.services import message as message_service
from app.schemas.message import MessageResponse
from app.schemas.user import UserResponse

router = APIRouter(prefix="/rooms", tags=["rooms"])


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
    return await room_service.create_room(
        name=req.name,
        user_id=current_user.id,
        session=session,
    )


# GET /rooms - 내가 속한 방 목록 조회
@router.get(
    "",
    response_model=list[RoomResponse],
    status_code=status.HTTP_200_OK,
    description="내가 속한 그룹방 목록 조회",
)
async def get_rooms(
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    return await room_service.get_rooms(current_user.id, session)


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
    return await room_service.create_dm(
        user_id=current_user.id,
        target_id=req.target_user_id,
        session=session,
    )


# GET /rooms/dm - 내가 속한 DM방 목록 조회
@router.get(
    "/dm",
    response_model=list[DmRoomResponse],
    status_code=status.HTTP_200_OK,
    description="내가 속한 DM방 목록 조회",
)
async def get_dm_rooms(
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    return await room_service.get_dm_rooms(current_user.id, session)


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
    before_message_id: UUID | None = None,
):
    return await message_service.get_messages(
        user_id=current_user.id,
        room_id=room_id,
        session=session,
        before_message_id=before_message_id,
    )


# GET /rooms/{room_id}/members - 그룹방 유저 목록 조회
@router.get(
    "/{room_id}/members",
    response_model=list[UserResponse],
    status_code=status.HTTP_200_OK,
    description="그룹방 유저 목록 조회",
)
async def get_room_members(
    room_id: UUID,
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    return await room_service.get_room_members(
        room_id=room_id,
        user_id=current_user.id,
        session=session,
    )


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

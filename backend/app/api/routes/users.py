from typing import Annotated

from fastapi import APIRouter, Depends
from starlette import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import users as users_service
from app.schemas.user import UserResponse
from app.db.session import get_db
from app.domain.user import UserEntity
from app.api.deps import get_current_user

router = APIRouter(prefix="/users")


# GET /users - 회원 목록 조회 (본인 제외)
@router.get(
    "",
    response_model=list[UserResponse],
    status_code=status.HTTP_200_OK,
    description="회원 목록 조회 (본인 제외)",
)
async def get_users(
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    users = await users_service.get_users(current_user.id, session)

    return [
        UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            created_at=user.created_at,
        )
        for user in users
    ]


# GET /users/me - 자기 정보 조회
@router.get(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    description="회원(본인) 정보 조회",
)
async def get_user_info(
    current_user: Annotated[UserEntity, Depends(get_current_user)],
):
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        created_at=current_user.created_at,
    )

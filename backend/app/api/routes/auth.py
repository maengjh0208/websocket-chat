from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import auth as auth_service
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


# POST /auth/register - 회원 가입
@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    description="회원 가입",
)
async def register(req: RegisterRequest, session: Annotated[AsyncSession, Depends(get_db)]):
    access_token = await auth_service.register(
        username=req.username,
        email=req.email,
        password=req.password,
        session=session,
    )

    return TokenResponse(access_token=access_token)


# POST /auth/login - 로그인
@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    description="로그인",
)
async def login(req: LoginRequest, session: Annotated[AsyncSession, Depends(get_db)]):
    access_token = await auth_service.login(
        email=req.email,
        password=req.password,
        session=session,
    )

    return TokenResponse(access_token=access_token)

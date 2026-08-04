from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import auth as auth_service
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.db.session import get_db
from app.core.limiter import limiter
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


# POST /auth/register - 회원 가입
@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    description="회원 가입",
)
@limiter.limit(settings.AUTH_RATE_LIMIT)
async def register(
    request: Request,  # slowapi가 요청을 가로채려면 (실제로 값을 쓰지 않더라도) 반드시 필요. 왜냐하면 데코레이터 자체는 FastAPI의 의존성 주입 시스템 밖에서 동작하기 떄문.
    req: RegisterRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
):
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
@limiter.limit(settings.AUTH_RATE_LIMIT)
async def login(
    request: Request,
    req: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
):
    access_token = await auth_service.login(
        email=req.email,
        password=req.password,
        session=session,
    )

    return TokenResponse(access_token=access_token)

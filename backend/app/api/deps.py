from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.models import User
from app.db.session import get_db
from app.core.exceptions import ErrorCode, UnauthorizedError

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        user_id = decode_token(credentials.credentials)
    except JWTError:
        raise UnauthorizedError(error_code=ErrorCode.INVALID_TOKEN)

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        # 토근 인증 맥락에서 유저가 없는 것. 따라서 404 에러보다는 401(인증 실패)가 더 적합.
        raise UnauthorizedError(error_code=ErrorCode.USER_NOT_FOUND)

    return user

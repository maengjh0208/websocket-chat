from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import user as crud_user
from app.core.exceptions import BadRequestError, ErrorCode, UnauthorizedError
from app.core.security import create_access_token, hash_password, verify_password


async def register(username: str, email: str, password: str, session: AsyncSession) -> str:
    if await crud_user.get_user_by_email(session, email):
        raise BadRequestError(error_code=ErrorCode.EMAIL_ALREADY_EXISTS)

    hashed_password = hash_password(password)

    user = await crud_user.create_user(
        session=session,
        username=username,
        email=email,
        hashed_password=hashed_password,
    )

    return create_access_token(user.id)


async def login(email: str, password: str, session: AsyncSession) -> str:
    user = await crud_user.get_user_by_email(session, email)
    if not user:
        raise UnauthorizedError(error_code=ErrorCode.INVALID_CREDENTIALS, detail="이메일 또는 비밀번호가 올바르지 않음")

    if not verify_password(password, user.hashed_password):
        raise UnauthorizedError(error_code=ErrorCode.INVALID_CREDENTIALS, detail="이메일 또는 비밀번호가 올바르지 않음")

    return create_access_token(user.id)

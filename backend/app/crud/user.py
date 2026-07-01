from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.domain.user import UserEntity, UserWithPassword


async def get_by_id(session: AsyncSession, user_id: str) -> UserEntity | None:
    query = select(User).where(User.id == user_id)
    result = await session.execute(query)
    user = result.scalar_one_or_none()

    return (
        UserEntity(
            id=user.id,
            username=user.username,
            email=user.email,
            created_at=user.created_at,
        )
        if user
        else None
    )


async def get_by_email(session: AsyncSession, email: str) -> UserWithPassword | None:
    query = select(User).where(User.email == email)
    result = await session.execute(query)
    user = result.scalar_one_or_none()

    return (
        UserWithPassword(
            id=user.id,
            username=user.username,
            email=user.email,
            hashed_password=user.hashed_password,
            created_at=user.created_at,
        )
        if user
        else None
    )


async def create(session: AsyncSession, username: str, email: str, hashed_password: str) -> UserEntity:
    user = User(username=username, email=email, hashed_password=hashed_password)
    session.add(user)
    await session.flush()

    return UserEntity(
        id=user.id,
        username=user.username,
        email=user.email,
        created_at=user.created_at,
    )

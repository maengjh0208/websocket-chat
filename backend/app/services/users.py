from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import user as crud_user
from app.domain.user import UserEntity


async def get_users(user_id: UUID, session: AsyncSession) -> list[UserEntity]:
    return await crud_user.get_all_users_except(session, user_id)

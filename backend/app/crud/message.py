from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.message import MessageEntity
from app.db.models import Message, User
from app.domain.user import UserEntity


async def get_messages_by_room(session: AsyncSession, room_id: UUID, limit: int = 50) -> list[MessageEntity]:
    query = (
        select(
            Message.id.label("message_id"),
            Message.room_id,
            Message.content,
            Message.created_at.label("message_created_at"),
            User.id.label("user_id"),
            User.username,
            User.email,
            User.created_at.label("user_created_at"),
        )
        .join(User, User.id == Message.sender_id)
        .where(Message.room_id == room_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )

    result = await session.execute(query)
    rows = result.all()

    return [
        MessageEntity(
            id=row.message_id,
            room_id=row.room_id,
            sender=UserEntity(
                id=row.user_id,
                username=row.username,
                email=row.email,
                created_at=row.user_created_at,
            ),
            content=row.content,
            created_at=row.message_created_at,
        )
        for row in rows
    ][::-1]


async def create_message(
    session: AsyncSession, room_id: UUID, user_id: UUID, content: str
) -> tuple:  # (UUID, datetime)
    message = Message(room_id=room_id, sender_id=user_id, content=content)
    session.add(message)
    await session.flush()

    return message.id, message.created_at

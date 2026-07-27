from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import room as crud_room
from app.crud import message as crud_message
from app.crud import reaction as crud_reaction
from app.domain.message import MessageEntity
from app.core.exceptions import ErrorCode, ForbiddenError


async def get_messages(
    user_id: UUID,
    room_id: UUID,
    session: AsyncSession,
    before_message_id: UUID | None = None,
) -> list[MessageEntity]:
    if not await crud_room.is_room_member(
        session=session,
        user_id=user_id,
        room_id=room_id,
    ):
        raise ForbiddenError(error_code=ErrorCode.FORBIDDEN)

    messages = await crud_message.get_messages_by_room(
        session=session,
        room_id=room_id,
        before_message_id=before_message_id,
    )

    reactions_map = await crud_reaction.get_reactions_by_message_ids(
        session=session,
        message_ids=[m.id for m in messages],
    )

    for message in messages:
        message.reactions = reactions_map.get(message.id, [])

    return messages

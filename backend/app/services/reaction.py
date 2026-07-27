from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import message as crud_message
from app.crud import room as crud_room
from app.crud import reaction as crud_reaction
from app.core.exceptions import BadRequestError, ErrorCode, ForbiddenError
from app.domain.reaction import ReactionEntity, ReactionSummaryEntity


async def toggle_reaction(
    user_id: UUID,
    message_id: UUID,
    emoji: str,
    session: AsyncSession,
) -> tuple[UUID, list[ReactionSummaryEntity]]:
    room_id = await crud_message.get_room_id_by_message(session, message_id)

    if not room_id or not await crud_room.is_room_member(session=session, user_id=user_id, room_id=room_id):
        raise ForbiddenError(error_code=ErrorCode.NOT_ROOM_MEMBER)

    if not await crud_reaction.check_allowed_reaction(session, emoji):
        raise BadRequestError(error_code=ErrorCode.NOT_ALLOWED_REACTION)

    await crud_reaction.toggle_reaction(session=session, message_id=message_id, user_id=user_id, emoji=emoji)

    reactions_map = await crud_reaction.get_reactions_by_message_ids(session, [message_id])
    return room_id, reactions_map.get(message_id, [])


async def get_allowed_reactions(session: AsyncSession) -> list[ReactionEntity]:
    return await crud_reaction.get_allowed_reactions(session)

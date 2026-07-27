from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AllowedReaction, MessageReaction
from app.domain.reaction import ReactionEntity, ReactionSummaryEntity


async def get_allowed_reactions(session: AsyncSession) -> list[ReactionEntity]:
    query = (
        select(
            AllowedReaction.id,
            AllowedReaction.emoji,
            AllowedReaction.sort_order,
        )
        .where(AllowedReaction.is_active.is_(True))
        .order_by(AllowedReaction.sort_order)
    )

    result = await session.execute(query)
    rows = result.all()
    return [
        ReactionEntity(
            id=row.id,
            emoji=row.emoji,
            sort_order=row.sort_order,
        )
        for row in rows
    ]


async def check_allowed_reaction(session: AsyncSession, emoji: str) -> bool:
    query = select(AllowedReaction.id).where(
        AllowedReaction.emoji == emoji,
        AllowedReaction.is_active.is_(True),
    )

    result = await session.execute(query)
    return result.scalar_one_or_none() is not None


async def toggle_reaction(session: AsyncSession, message_id: UUID, user_id: UUID, emoji: str) -> bool:
    query = select(MessageReaction).where(
        MessageReaction.message_id == message_id,
        MessageReaction.user_id == user_id,
        MessageReaction.emoji == emoji,
    )

    result = await session.execute(query)
    existing = result.scalar_one_or_none()

    if existing:
        await session.delete(existing)
        return False

    session.add(MessageReaction(message_id=message_id, user_id=user_id, emoji=emoji))
    return True


async def get_reactions_by_message_ids(
    session: AsyncSession,
    message_ids: list[UUID],
) -> dict[UUID, list[ReactionSummaryEntity]]:
    if not message_ids:
        return {}

    query = select(
        MessageReaction.message_id,
        MessageReaction.user_id,
        MessageReaction.emoji,
    ).where(MessageReaction.message_id.in_(message_ids))

    result = await session.execute(query)
    rows = result.all()

    message_group = {}
    for row in rows:
        by_emoji = message_group.setdefault(row.message_id, {})
        by_emoji.setdefault(row.emoji, []).append(row.user_id)

    return {
        message_id: [
            ReactionSummaryEntity(
                emoji=emoji,
                user_ids=user_ids,
            )
            for emoji, user_ids in by_emoji.items()
        ]
        for message_id, by_emoji in message_group.items()
    }

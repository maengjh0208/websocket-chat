from dataclasses import dataclass
from uuid import UUID


@dataclass(kw_only=True)
class ReactionEntity:
    id: UUID
    emoji: str
    sort_order: int


@dataclass(kw_only=True)
class ReactionSummaryEntity:
    emoji: str
    user_ids: list[UUID]

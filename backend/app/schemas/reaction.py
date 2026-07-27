from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AllowedReactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    emoji: str
    sort_order: int


class ReactionSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    emoji: str
    user_ids: list[UUID]

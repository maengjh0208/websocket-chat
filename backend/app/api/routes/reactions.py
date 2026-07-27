from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.reaction import AllowedReactionResponse
from app.db.session import get_db
from app.services import reaction as reaction_service
from app.api.deps import get_current_user
from app.domain.user import UserEntity

router = APIRouter(prefix="/reactions", tags=["reactions"])


# GET /reactions/allowed - 사용 가능한 리액션 이모지 목록 조회
@router.get(
    "/allowed",
    response_model=list[AllowedReactionResponse],
    status_code=status.HTTP_200_OK,
    description="사용 가능한 리액션 이모지 목록 조회",
)
async def get_allowed_reactions(
    current_user: Annotated[UserEntity, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    return await reaction_service.get_allowed_reactions(session)

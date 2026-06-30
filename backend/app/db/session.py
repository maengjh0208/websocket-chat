from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine, AsyncSession

from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    # expire_on_commit=True -> commit 후 객체가 만료되서, 해당 속성에 접근할때 DB에서 재조회를 함. (세션이 닫힌 뒤 접근하면 에러 발생)
    expire_on_commit=False,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        # session.close()는 async with가 알아서 처리.

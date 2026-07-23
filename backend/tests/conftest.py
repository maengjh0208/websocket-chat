# conftest.py : test fixture를 설정하는 파일

# conftest.py 가 하는일:
# - pytest는 conftest.py에서 fixture를 자동으로 불러옴
# - fixture은 테스트 함수가 실행되기 전/후에 공통 상태를 준비하고 정리해주는 함수
# - db fixture: 테스트용 DB에 테이블 생성 -> 테스트 실행 -> 테이블 삭제
# - client fixture: FastAPI 앱을 실제 서버 없이 HTTP 요청할 수 있는 AsyncClient 제공

from httpx import ASGITransport, AsyncClient
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine, AsyncSession
import redis.asyncio as aioredis

from app.core.config import settings
from app.db.models import Base
from app.main import app
from app.db.session import get_db


@pytest_asyncio.fixture(scope="function")
async def db():
    engine = create_async_engine(settings.TEST_DATABASE_URL)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)  # 테이블 생성

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)  # 테이블 삭제 (테스트 격리 목적)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(db):
    app.dependency_overrides[get_db] = lambda: db  # 테스트 DB로 교체

    # AsyncClient는 httpx 라이브러리의 HTTP 클라이언트.
    # 보통은 실제 서버 주소(http://localhost:8000)으로 요청을 보내지만,
    # ASGITransport(app=app)을 쓰면 서버를 실행하지 않고 FastAPI 앱에 직접 요청을 전달함.
    # 네트워크를 거치지 않아서 빠르고, 별도 포트가 필요 없음.
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    # 테스트가 끝나면 교체했던 의존성을 원래대로 되돌림 (이걸 안하면 다음 테스트에서도 테스트 DB가 주입된채로 남아있게 됨.)
    app.dependency_overrides.clear()


# autouse=True: 모든 테스트에 자동 적용
@pytest_asyncio.fixture(autouse=True)
# monkeypatch: pytest가 기본 제공하는 fixture
async def override_redis(monkeypatch):
    # 테스트 전용 redis client 생성 (localhost로 접속)
    test_redis_client = aioredis.from_url(url=settings.TEST_REDIS_URL, decode_responses=True)

    # monkeypatch.setattr("경로.이름", 값): 문자여로 된 경로를 보고 그 자리의 변수를 바꿔침.
    monkeypatch.setattr("app.core.redis.redis_client", test_redis_client)
    monkeypatch.setattr("app.managers.pubsub.redis_client", test_redis_client)
    monkeypatch.setattr("app.managers.presence.redis_client", test_redis_client)

    # yield 이후 테스트 함수 하나 끝날때마다 실행됨. db fixture가 테이블을 drop 하는것 처럼 여기선 만들어둔 연결을 정리.
    yield

    await test_redis_client.aclose()

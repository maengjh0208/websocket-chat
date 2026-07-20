import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.error_handlers import register_exception_handlers
from app.api.routes.auth import router as auth_router
from app.api.routes.users import router as users_router
from app.api.routes.rooms import router as rooms_router
from app.api.routes.friends import router as friends_router
from app.api.websocket import router as websocket_router
from app.api.websocket import handle_pubsub_message
from app.managers import pubsub
from app.db.session import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # subscribe는 async for 로 Redis를 계속 구독하는 무한 루프임. 그냥 await를 하면 서버가 여기서 멈춤. create_task로 백그라운드 태스크로 띄워야함. (서버가 정상 동작하면서 동시에 Redis도 구독할 수 있음)
    task = asyncio.create_task(pubsub.subscribe(handle_pubsub_message))

    yield

    # redis pub/sub 종료
    task.cancel()

    # connection pool 초기화
    await engine.dispose()


app = FastAPI(title="WebSocket Chat", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # 이 출처에서 온 요청만 허용
    allow_credentials=True,  # 쿠키/Authorization 헤더 허용
    allow_methods=["*"],  # GET, POST, PUT, DELETE 등 모두 허용
    allow_headers=["*"],  # 모든 요청 헤더 허용 (Authorization 포함)
)

register_exception_handlers(app)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(rooms_router)
app.include_router(friends_router)

app.include_router(websocket_router)


@app.get("/health")
async def health():
    return {"status": "ok"}

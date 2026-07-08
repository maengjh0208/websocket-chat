from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.error_handlers import register_exception_handlers
from app.api.routes.auth import router as auth_router
from app.api.routes.users import router as users_router
from app.api.routes.rooms import router as rooms_router
from app.api.websocket import router as websocket_router

app = FastAPI(title="WebSocket Chat")

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

app.include_router(websocket_router)


@app.get("/health")
async def health():
    return {"status": "ok"}

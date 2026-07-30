from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.core.exceptions import AppError, ErrorCode


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": exc.error_code,
                "detail": exc.detail,
                "status_code": exc.status_code,
            },
        )

    @app.exception_handler(RateLimitExceeded)
    def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        # slowapi가 limit 초과 시 던지는 예외.
        # SlowAPIMiddleware(BaseHTTPMiddleware 기반)는 내부적으로 동기 코드 경로에서만 예외 핸들러를 호출할 수 있어서
        # 이 핸들라가 async면 slowapi가 호출하지 못하고 자기 기본 응답 포맷으로 조용히 대체해버림.
        # 그래서 반드시 동기 함수여야 함.
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "error_code": ErrorCode.RATE_LIMIT_EXCEEDED,
                "detail": f"요청이 너무 많습니다 ({exc.detail})",  # exc.detail은 "60 per 1 minute" 같은 사람이 읽는 문자열 형태.
                "status_code": status.HTTP_429_TOO_MANY_REQUESTS,
            },
        )

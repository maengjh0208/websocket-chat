from fastapi import Request
from jose import JWTError
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.security import decode_token
from app.core.config import settings


def rate_limit_key(request: Request) -> str:
    # 인증된 요청(Authorization 헤더에 유효한 JWT)은 user_id 기준으로
    # 그 외(로그인/회원가입 처럼 토큰이 없는 요청) 클라이언트 IP 기준으로 제한.
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split()[1]

        try:
            user_id = decode_token(token)
            return f"user:{user_id}"
        except JWTError:
            pass

    return get_remote_address(request)


limiter = Limiter(
    key_func=rate_limit_key,  # 동기 함수여야 함
    default_limits=["60/minute"],
    storage_uri=settings.REDIS_URL,
)

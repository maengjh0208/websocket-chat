from datetime import datetime, timedelta, timezone

from passlib.context import CryptContext
from jose import JWTError, jwt

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    # 비밀번호 암호화
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    # 비밀번호 검증
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    # JWT Token 생성
    expire = datetime.now(timezone.utc) + timedelta(days=settings.ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {
            "sub": user_id,
            "exp": expire,
        },
        settings.SECRET_KEY,
        algorithm="HS256",
    )


def decode_token(token: str) -> str:
    # JWT Token 검증 및 user_id 반환
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    return payload["sub"]

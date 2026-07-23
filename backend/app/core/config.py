from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    TEST_DATABASE_URL: str | None = None
    REDIS_URL: str
    TEST_REDIS_URL: str | None = None
    SECRET_KEY: str  # JWT 서명용
    ACCESS_TOKEN_EXPIRE_DAYS: int
    SENTRY_DSN: str | None = None

    class Config:
        # 파일이 없으면 무시하고 환경변수에서 읽음. 따라서 상용 환경에서도 코드 변경 없이 그대로 동작 가능.
        env_file = ".env.local"


settings = Settings()

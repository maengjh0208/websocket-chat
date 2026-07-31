from pydantic_settings import BaseSettings

from app.core.enums import Environment


class Settings(BaseSettings):
    ENV: Environment
    # Database
    DB_USER: str
    DB_PASSWORD: str
    DB_HOST: str
    DB_PORT: int
    DB_NAME: str
    DB_SSL_MODE: str | None = None
    TEST_DB_NAME: str | None = None  # 로컬에서 테스트용 DB만 이름이 다르고, 나머지 연결 정보는 동일
    # Redis
    REDIS_BASE_URL: str
    # JWT 서명용
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_DAYS: int
    # Sentry
    SENTRY_DSN: str | None = None

    class Config:
        # 파일이 없으면 무시하고 환경변수에서 읽음. 따라서 상용 환경에서도 코드 변경 없이 그대로 동작 가능.
        env_file = ".env.local"

    def _build_db_url(self, db_name: str) -> str:
        url = f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{db_name}"

        if self.DB_SSL_MODE:
            url += f"?ssl={self.DB_SSL_MODE}"

        return url

    @property
    def DATABASE_URL(self) -> str:
        return self._build_db_url(self.DB_NAME)

    @property
    def TEST_DATABASE_URL(self) -> str | None:
        return self._build_db_url(self.TEST_DB_NAME) if self.TEST_DB_NAME else None

    @property
    def REDIS_URL(self) -> str:
        redis_url = self.REDIS_BASE_URL
        if self.ENV == Environment.TEST:
            redis_url += "/1"

        return redis_url


settings = Settings()

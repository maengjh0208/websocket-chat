from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    TEST_DATABASE_URL: str  # 테스트용 DB
    SECRET_KEY: str  # JWT 서명용
    ACCESS_TOKEN_EXPIRE_DAYS: int

    class Config:
        env_file = ".env"


settings = Settings()

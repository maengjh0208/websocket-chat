from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    TEST_DATABASE_URL: str  # 테스트용 DB
    SECRET_KEY: str  # JWT 서명용
    ACCESS_TOKEN_EXPIRE_DAYS: int
    REDIS_URL: str

    class Config:
        # 로컬 환경에서 pytest 실행시킬 때, pydantic-settings의 env_file = ".env" 덕분에 앱이 시작될 때 자동으로 .env 파일을 읽어와서 TEST_DATABASE_URL을 로드함.
        # 따라서 pytest 실행 시 환경변수를 따로 주입하지 않아도 됨.
        # 파일이 없으면 무시하고 환경변수에서 읽기 때문에 상용 환경에서도 코드 변경 없이 그대로 동작 가능.
        env_file = ".env"


settings = Settings()

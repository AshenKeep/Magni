from pydantic_settings import BaseSettings
from functools import lru_cache

APP_VERSION = "0.0.1"


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    secret_key: str
    app_url: str                                    # Must be https://
    allowed_origins: str
    environment: str = "production"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()

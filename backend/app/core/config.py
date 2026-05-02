from pydantic_settings import BaseSettings
from functools import lru_cache

APP_VERSION = "0.0.9"


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    secret_key: str
    app_url: str                                    # Must be https://
    allowed_origins: str
    environment: str = "production"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Backup
    backup_dir: str = "/backups"
    backup_schedule: str = "0 2 * * *"  # cron — default 2am daily
    tz: str = "UTC"

    # API keys for exercise seeding (AscendAPI, WorkoutX) are stored in the database
    # via the api_keys table — managed through the admin UI, not env vars.

    # Media storage — for locally cached exercise GIFs
    # Options: "external" (CDN links only), "local" (local Docker volume), "cifs" (NAS share)
    media_storage: str = "external"
    media_dir: str = "/media/exercises"
    media_cifs_path: str = ""
    media_cifs_username: str = ""
    media_cifs_password: str = ""

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()

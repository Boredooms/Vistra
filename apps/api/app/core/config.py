from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_env() -> tuple[str, ...]:
    """.env, then .env.local (local overrides, e.g. a Docker Postgres) from the nearest ancestor that has .env."""
    for parent in Path(__file__).resolve().parents:
        if (parent / ".env").is_file():
            return tuple(str(parent / n) for n in (".env", ".env.local") if (parent / n).is_file())
    return ()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_find_env(), extra="ignore", case_sensitive=False)

    app_env: str = "development"
    app_url: str = "http://localhost:3001"
    api_url: str = "http://localhost:8000"
    api_version: str = "v1"

    clerk_secret_key: str = ""
    clerk_issuer: str = ""
    clerk_jwks_url: str = ""

    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    supabase_db_url: str = ""

    ai_primary_provider: str = "gemini"
    ai_fallback_provider: str = "nvidia"
    ai_provider_mode: str = "live"  # live | fake
    ai_allow_fault_injection: bool = False

    gemini_api_key: str = ""
    gemini_model_default: str = "gemini-3.5-flash"
    gemini_model_fast: str = "gemini-3.5-flash-lite"
    gemini_model_embedding: str = "gemini-embedding-001"
    gemini_embedding_dim: int = 768

    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model_default: str = "nvidia/nemotron-3.5-lightning-30b-a3b"

    tool_signing_secret: str = ""
    encryption_key: str = ""
    encryption_key_version: int = 1

    redis_url: str = ""
    worker_embedded: bool = True  # run the ingestion worker inside the API process (single-service deploys)
    storage_provider: str = "supabase"
    cors_allowed_origins: str = ""
    rate_limit_enabled: bool = False
    log_level: str = "INFO"
    sentry_dsn: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()

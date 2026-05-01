from functools import lru_cache
from pathlib import Path

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = Field("development")
    app_log_level: str = Field("INFO")
    app_host: str = Field("0.0.0.0")
    app_port: int = Field(8000)
    app_reload: bool = Field(True)
    frontend_origins: str = Field(
        "http://localhost:5173,http://127.0.0.1:5173",
        alias="FRONTEND_ORIGINS",
    )
    frontend_origin_regex: str = Field(
        r"^https://.*\.vercel\.app$",
        alias="FRONTEND_ORIGIN_REGEX",
    )

    chroma_collection_name: str = Field("movies")
    ollama_base_url: str = Field("http://localhost:11434")
    ollama_model: str = Field("llama3.1:8b")
    ollama_timeout: int = Field(120)
    enable_ollama: bool = Field(True)

    embedding_model: str = Field("sentence-transformers/all-MiniLM-L6-v2")
    embedding_batch_size: int = Field(64)
    embedding_device: str = Field("cpu")

    movielens_variant: str = Field("ml-latest-small")
    movielens_download_url: str = Field(
        "https://files.grouplens.org/datasets/movielens"
    )

    sqlite_db_path: str = Field("data/processed/interactions.db")
    retrieval_top_k: int = Field(20)
    rerank_top_n: int = Field(5)

    storage_backend: str = Field("sqlite")
    mongodb_uri: str = Field("")
    mongodb_db_name: str = Field("moviesite")

    auth_secret: str = Field(
        default_factory=lambda: "movie-man-dev-secret-change-me",
        alias="AUTH_SECRET",
    )
    jwt_secret: str = Field(default="", alias="JWT_SECRET")

    cloudinary_cloud_name: str = Field("", alias="CLOUDINARY_CLOUD_NAME")
    cloudinary_api_key: str = Field("", alias="CLOUDINARY_API_KEY")
    cloudinary_api_secret: str = Field("", alias="CLOUDINARY_API_SECRET")
    tmdb_api_key: str = Field("", alias="TMDB_API_KEY")
    tmdb_bearer_token: str = Field("", alias="TMDB_BEARER_TOKEN")
    vite_tmdb_api_key: str = Field("", alias="VITE_TMDB_API_KEY")

    @computed_field  # type: ignore[misc]
    @property
    def effective_auth_secret(self) -> str:
        return self.jwt_secret or self.auth_secret

    @computed_field  # type: ignore[misc]
    @property
    def data_external_dir(self) -> Path:
        return ROOT_DIR / "data" / "external"

    @computed_field  # type: ignore[misc]
    @property
    def data_raw_dir(self) -> Path:
        return ROOT_DIR / "data" / "raw" / self.movielens_variant

    @computed_field  # type: ignore[misc]
    @property
    def chroma_persist_dir(self) -> Path:
        return ROOT_DIR / "chroma_storage"

    @computed_field  # type: ignore[misc]
    @property
    def data_interim_dir(self) -> Path:
        return ROOT_DIR / "data" / "interim"

    @computed_field  # type: ignore[misc]
    @property
    def data_processed_dir(self) -> Path:
        return ROOT_DIR / "data" / "processed"

    @computed_field  # type: ignore[misc]
    @property
    def models_dir(self) -> Path:
        return ROOT_DIR / "models"

    @computed_field  # type: ignore[misc]
    @property
    def sqlite_db_url(self) -> str:
        return f"sqlite+aiosqlite:///{ROOT_DIR / self.sqlite_db_path}"

    @computed_field  # type: ignore[misc]
    @property
    def cloudinary_enabled(self) -> bool:
        return bool(
            self.cloudinary_cloud_name
            and self.cloudinary_api_key
            and self.cloudinary_api_secret
        )

    @computed_field  # type: ignore[misc]
    @property
    def transformer_cache_dir(self) -> Path:
        return self.models_dir / "cache"

    @computed_field  # type: ignore[misc]
    @property
    def effective_tmdb_bearer_token(self) -> str:
        return self.tmdb_bearer_token or self.vite_tmdb_api_key

    @computed_field  # type: ignore[misc]
    @property
    def cors_allowed_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.frontend_origins.split(",")
            if origin.strip()
        ]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from collections import Counter
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from movie_recommender.config import get_settings
settings = get_settings()

import os
os.environ["SENTENCE_TRANSFORMERS_HOME"] = str(settings.transformer_cache_dir)
# Ensure the directory exists
settings.transformer_cache_dir.mkdir(parents=True, exist_ok=True)

from movie_recommender.db.store import DEFAULT_PROFILE_ID, get_store

from contextlib import asynccontextmanager
from movie_recommender.vector_db.chroma_client import make_client, ensure_collection
from scripts.build_index import build_idx

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Check if index exists (we now pre-index locally and push to GitHub)
    try:
        client = make_client()
        collection = ensure_collection(client)
        count = collection.count()
        if count == 0:
            print("WARNING: ChromaDB collection is empty. Did you push 'chroma_storage' to GitHub?")
        else:
            print(f"ChromaDB collection loaded with {count} documents.")
    except Exception as e:
        print(f"Error checking index: {e}")
    yield

app = FastAPI(
    title="Movie Recommendation AI",
    description="Vector search + LLM reranking pipeline exposed as a REST API.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost:5173|http://127\.0\.0\.1:5173",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RecommendRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)
    top_k: int = Field(default=5, ge=1, le=20)


class MovieResult(BaseModel):
    rank: int
    movie_id: str | None = None
    title: str
    year: str | None = None
    genre: str | None = None
    score: float | None = None
    reason: str | None = None
    poster_url: str | None = None


class RecommendResponse(BaseModel):
    query_id: str
    query: str
    recommendations: list[MovieResult]


class HistoryItem(BaseModel):
    query_id: str
    query_text: str
    created_at: str
    recommendations: list[MovieResult]


class AuthUser(BaseModel):
    user_id: str
    displayName: str
    username: str
    email: str
    created_at: str | None = None


class AuthResponse(BaseModel):
    token: str
    user: AuthUser


class SignupRequest(BaseModel):
    displayName: str = Field(..., min_length=2, max_length=120)
    username: str = Field(..., min_length=3, max_length=60)
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    identifier: str = Field(..., min_length=3, max_length=120)
    password: str = Field(..., min_length=6, max_length=128)


class ProfileImage(BaseModel):
    url: str | None = None
    publicId: str | None = None


class ProfileStats(BaseModel):
    moviesTrained: int = 0
    tasteSync: float = 0.0


class WatchlistMovie(BaseModel):
    movie_id: str | None = None
    tmdb_id: int | None = None
    title: str
    year: str | None = None
    genre: str | None = None
    poster_url: str | None = None
    poster_path: str | None = None
    backdrop_path: str | None = None
    release_date: str | None = None
    original_language: str | None = None
    vote_average: float | None = None
    score: float | None = None


class ProfilePayload(BaseModel):
    displayName: str | None = None
    username: str | None = None
    email: str | None = None
    avatar: ProfileImage | None = None
    banner: ProfileImage | None = None
    stats: ProfileStats | None = None
    watchlist: list[WatchlistMovie] | None = None


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120000,
    ).hex()


def _create_token(user_id: str) -> str:
    timestamp = str(int(time.time()))
    payload = f"movie-man:{user_id}:{timestamp}"
    signature = hmac.new(
        get_settings().effective_auth_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}:{signature}"


def _decode_token(token: str) -> str | None:
    parts = token.split(":")
    if len(parts) != 4 or parts[0] != "movie-man":
        return None

    payload = ":".join(parts[:3])
    signature = parts[3]
    expected = hmac.new(
        get_settings().effective_auth_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None
    return parts[1]


def _extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value:
        return None
    return value.strip()


def _get_current_user(authorization: str | None) -> dict[str, Any] | None:
    token = _extract_bearer_token(authorization)
    if not token:
        return None
    user_id = _decode_token(token)
    if not user_id:
        return None
    return get_store().get_user_by_id(user_id)


def _require_current_user(authorization: str | None) -> dict[str, Any]:
    user = _get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user


def _build_personalized_query(query: str, profile_id: str) -> str:
    history = get_store().get_history(limit=100, offset=0, profile_id=profile_id)
    if not history:
        return query

    query_counter: Counter[str] = Counter()
    genre_counter: Counter[str] = Counter()
    title_counter: Counter[str] = Counter()

    for item in history:
        query_text = item.get("query_text", "").strip()
        if query_text:
            query_counter[query_text] += 1

        for recommendation in item.get("recommendations", []):
            title = str(recommendation.get("title", "")).strip()
            if title:
                title_counter[title] += 1

            raw_genres = str(recommendation.get("genre", "")).split(",")
            for genre in raw_genres:
                normalized = genre.strip()
                if normalized:
                    genre_counter[normalized] += 1

    top_query_themes = [name for name, _count in query_counter.most_common(8)]
    top_genres = [name for name, _count in genre_counter.most_common(6)]
    recurring_titles = [name for name, _count in title_counter.most_common(4)]

    context_parts = [
        f'Primary request: "{query}"',
        "Personalize this search using the user's long-term AI search history, not only the latest query.",
    ]
    if top_query_themes:
        context_parts.append(
            "Recurring search themes across prior AI searches: " + " | ".join(top_query_themes)
        )
    if top_genres:
        context_parts.append(
            "Genres that consistently appear in the user's prior recommendations: "
            + ", ".join(top_genres)
        )
    if recurring_titles:
        context_parts.append(
            "Titles or tones that repeatedly surface in the user's results: "
            + ", ".join(recurring_titles)
        )
    context_parts.append(
        "Match the primary request first, but bias the final recommendations toward these ongoing taste patterns whenever they fit."
    )
    return "\n".join(context_parts)


def _maybe_upload_profile_image(
    file_bytes: bytes,
    filename: str,
    existing_public_id: str | None,
    folder: str,
) -> dict[str, str | None]:
    settings = get_settings()
    if not settings.cloudinary_enabled:
        raise HTTPException(status_code=400, detail="Cloudinary is not configured.")

    from movie_recommender.media.cloudinary_store import CloudinaryStore

    media_store = CloudinaryStore()
    media_store.delete_asset(existing_public_id)
    return media_store.upload_profile_image(file_bytes, filename, folder)


@app.get("/health", tags=["Meta"])
def health_check():
    return {"status": "ok"}


@app.post("/auth/signup", response_model=AuthResponse, tags=["Auth"])
def signup(body: SignupRequest):
    salt = secrets.token_hex(16)
    password_hash = _hash_password(body.password, salt)

    try:
        user = get_store().create_user(
            {
                "displayName": body.displayName,
                "username": body.username,
                "email": body.email,
                "password_hash": password_hash,
                "password_salt": salt,
            }
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    token = _create_token(user["user_id"])
    return AuthResponse(token=token, user=AuthUser.model_validate(user))


@app.post("/auth/login", response_model=AuthResponse, tags=["Auth"])
def login(body: LoginRequest):
    user = get_store().get_user_by_identifier(body.identifier)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    expected_hash = _hash_password(body.password, user["password_salt"])
    if expected_hash != user["password_hash"]:
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    token = _create_token(user["user_id"])
    return AuthResponse(token=token, user=AuthUser.model_validate(user))


@app.get("/auth/me", response_model=AuthUser, tags=["Auth"])
def me(authorization: str | None = Header(default=None)):
    user = _require_current_user(authorization)
    return AuthUser.model_validate(user)


@app.get("/profile", tags=["Profile"])
def get_profile(authorization: str | None = Header(default=None)):
    user = _require_current_user(authorization)
    return get_store().get_profile(user["user_id"])


@app.put("/profile", tags=["Profile"])
def update_profile(
    body: ProfilePayload,
    authorization: str | None = Header(default=None),
):
    user = _require_current_user(authorization)
    payload = body.model_dump(exclude_none=True)
    return get_store().save_profile(payload, profile_id=user["user_id"])


@app.post("/profile/upload", tags=["Profile"])
async def upload_profile_asset(
    target: str = Query(..., pattern="^(avatar|banner)$"),
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    user = _require_current_user(authorization)
    profile = get_store().get_profile(user["user_id"])

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file was empty.")

    existing_public_id = profile.get(target, {}).get("publicId")
    asset = _maybe_upload_profile_image(
        file_bytes=file_bytes,
        filename=f"{user['user_id']}-{target}",
        existing_public_id=existing_public_id,
        folder=f"movie-man/{target}s",
    )
    updated = get_store().save_profile({target: asset}, profile_id=user["user_id"])
    return {"target": target, "profile": updated}


@app.post("/recommend", response_model=RecommendResponse, tags=["Recommendation"])
def recommend(
    body: RecommendRequest,
    authorization: str | None = Header(default=None),
):
    from movie_recommender.recommender.pipeline import run_pipeline

    user = _get_current_user(authorization)
    profile_id = user["user_id"] if user else DEFAULT_PROFILE_ID
    pipeline_query = _build_personalized_query(body.query, profile_id)

    try:
        results: list[dict[str, Any]] = run_pipeline(pipeline_query, top_k=body.top_k)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {exc}")

    if not results:
        raise HTTPException(status_code=404, detail="No recommendations found for this query.")

    query_id = get_store().save_query_and_results(body.query, results, profile_id)
    return RecommendResponse(
        query_id=query_id,
        query=body.query,
        recommendations=[MovieResult(rank=i + 1, **r) for i, r in enumerate(results)],
    )


@app.get("/history", response_model=list[HistoryItem], tags=["History"])
def list_history(
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    authorization: str | None = Header(default=None),
):
    user = _get_current_user(authorization)
    profile_id = user["user_id"] if user else DEFAULT_PROFILE_ID
    return get_store().get_history(limit=limit, offset=offset, profile_id=profile_id)


@app.get("/history/{query_id}", response_model=HistoryItem, tags=["History"])
def get_single_history(
    query_id: str,
    authorization: str | None = Header(default=None),
):
    user = _get_current_user(authorization)
    profile_id = user["user_id"] if user else DEFAULT_PROFILE_ID
    record = get_store().get_query_by_id(query_id, profile_id=profile_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Query {query_id} not found.")
    return record

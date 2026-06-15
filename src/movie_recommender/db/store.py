from __future__ import annotations

from datetime import datetime, timezone
from secrets import token_hex
from typing import Any

from movie_recommender.config import get_settings
from movie_recommender.db import sqlite_store

DEFAULT_PROFILE_ID = "default-profile"

_SQLITE_USERS: dict[str, dict[str, Any]] = {}
_SQLITE_PROFILES: dict[str, dict[str, Any]] = {}

_store: SQLiteStore | MongoStore | None = None


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sanitize_user(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "user_id": document["user_id"],
        "displayName": document["displayName"],
        "username": document["username"],
        "email": document["email"],
        "created_at": document.get("created_at", _utc_now_iso()),
    }


def build_default_profile(
    profile_id: str = DEFAULT_PROFILE_ID,
    display_name: str = "Alex Rivers",
    username: str = "alexrivers",
    email: str = "alex@cinebuzz.io",
) -> dict[str, Any]:
    return {
        "profile_id": profile_id,
        "displayName": display_name,
        "username": username,
        "email": email,
        "avatar": {"url": None, "publicId": None},
        "banner": {"url": None, "publicId": None},
        "stats": {"moviesTrained": 0, "tasteSync": 0.0},
        "watchlist": [],
    }


def _normalize_movie_result(rank: int, result: dict[str, Any]) -> dict[str, Any]:
    return {
        "rank": rank,
        "movie_id": str(result.get("movie_id", "")),
        "title": str(result.get("title", "Unknown")),
        "year": str(result.get("year", "")),
        "genre": str(result.get("genre", "")),
        "score": float(result.get("score") or 0.0),
        "reason": str(result.get("reason", "")),
        "poster_url": result.get("poster_url"),
    }


class SQLiteStore:
    def init(self) -> None:
        sqlite_store.init_db()

    def save_query_and_results(
        self,
        query_text: str,
        results: list[dict[str, Any]],
        profile_id: str = DEFAULT_PROFILE_ID,
    ) -> str:
        return str(sqlite_store.save_query_and_results(query_text, results))

    def get_history(
        self,
        limit: int = 20,
        offset: int = 0,
        profile_id: str = DEFAULT_PROFILE_ID,
    ) -> list[dict[str, Any]]:
        history = sqlite_store.get_history(limit=limit, offset=offset)
        for item in history:
            item["query_id"] = str(item["query_id"])
        return history

    def get_query_by_id(
        self,
        query_id: str,
        profile_id: str = DEFAULT_PROFILE_ID,
    ) -> dict[str, Any] | None:
        try:
            sqlite_id = int(query_id)
        except ValueError:
            return None

        record = sqlite_store.get_query_by_id(sqlite_id)
        if record:
            record["query_id"] = str(record["query_id"])
        return record

    def get_profile(self, profile_id: str = DEFAULT_PROFILE_ID) -> dict[str, Any]:
        if profile_id in _SQLITE_PROFILES:
            return dict(_SQLITE_PROFILES[profile_id])

        user = self.get_user_by_id(profile_id)
        if user:
            profile = build_default_profile(
                profile_id=profile_id,
                display_name=user["displayName"],
                username=user["username"],
                email=user["email"],
            )
        else:
            profile = dict(build_default_profile(profile_id=profile_id))

        _SQLITE_PROFILES[profile_id] = dict(profile)
        return dict(profile)

    def save_profile(
        self,
        payload: dict[str, Any],
        profile_id: str = DEFAULT_PROFILE_ID,
    ) -> dict[str, Any]:
        profile = self.get_profile(profile_id)
        profile.update(payload)
        profile["profile_id"] = profile_id
        _SQLITE_PROFILES[profile_id] = dict(profile)
        return dict(profile)

    def create_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        email = payload["email"].strip().lower()
        username = payload["username"].strip().lower()

        if any(user["email"].lower() == email for user in _SQLITE_USERS.values()):
            raise ValueError("An account with this email already exists.")

        if any(user["username"].lower() == username for user in _SQLITE_USERS.values()):
            raise ValueError("That username is already taken.")

        user_id = token_hex(12)
        document = {
            "user_id": user_id,
            "displayName": payload["displayName"].strip(),
            "username": payload["username"].strip(),
            "email": payload["email"].strip(),
            "email_lower": email,
            "username_lower": username,
            "password_hash": payload["password_hash"],
            "password_salt": payload["password_salt"],
            "created_at": _utc_now_iso(),
        }
        _SQLITE_USERS[user_id] = document
        _SQLITE_PROFILES[user_id] = build_default_profile(
            profile_id=user_id,
            display_name=document["displayName"],
            username=document["username"],
            email=document["email"],
        )
        return _sanitize_user(document)

    def get_user_by_identifier(self, identifier: str) -> dict[str, Any] | None:
        normalized = identifier.strip().lower()
        for user in _SQLITE_USERS.values():
            if (
                user["email"].lower() == normalized
                or user["username"].lower() == normalized
            ):
                return dict(user)
        return None

    def get_user_by_id(self, user_id: str) -> dict[str, Any] | None:
        user = _SQLITE_USERS.get(user_id)
        return dict(user) if user else None


class MongoStore:
    def __init__(self) -> None:
        from pymongo import MongoClient

        settings = get_settings()
        self.client = MongoClient(
            settings.mongodb_uri,
            connectTimeoutMS=5000,
            serverSelectionTimeoutMS=5000,
            socketTimeoutMS=10000,
        )
        self.db = self.client[settings.mongodb_db_name]
        self.queries: Any = self.db["queries"]
        self.profiles: Any = self.db["profiles"]
        self.users: Any = self.db["users"]

    def init(self) -> None:
        self.queries.create_index([("profile_id", -1), ("created_at", -1)])
        self.profiles.create_index("profile_id", unique=True)
        self.users.create_index("user_id", unique=True)
        self.users.create_index("email_lower", unique=True)
        self.users.create_index("username_lower", unique=True)

    def save_query_and_results(
        self,
        query_text: str,
        results: list[dict[str, Any]],
        profile_id: str = DEFAULT_PROFILE_ID,
    ) -> str:
        now = _utc_now_iso()
        payload = {
            "profile_id": profile_id,
            "query_text": query_text,
            "created_at": now,
            "recommendations": [
                _normalize_movie_result(rank, result)
                for rank, result in enumerate(results, start=1)
            ],
        }
        inserted = self.queries.insert_one(payload)
        return str(inserted.inserted_id)

    def get_history(
        self,
        limit: int = 20,
        offset: int = 0,
        profile_id: str = DEFAULT_PROFILE_ID,
    ) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        cursor = (
            self.queries.find(
                {"profile_id": profile_id},
                {"query_text": 1, "created_at": 1, "recommendations": 1},
            )
            .sort("created_at", DESCENDING)
            .skip(offset)
            .limit(limit)
        )

        for document in cursor:
            items.append(
                {
                    "query_id": str(document["_id"]),
                    "query_text": document.get("query_text", ""),
                    "created_at": document.get("created_at", _utc_now_iso()),
                    "recommendations": document.get("recommendations", []),
                }
            )
        return items

    def get_query_by_id(
        self,
        query_id: str,
        profile_id: str = DEFAULT_PROFILE_ID,
    ) -> dict[str, Any] | None:
        from bson import ObjectId

        if not ObjectId.is_valid(query_id):
            return None

        document = self.queries.find_one({"_id": ObjectId(query_id), "profile_id": profile_id})
        if not document:
            return None

        return {
            "query_id": str(document["_id"]),
            "query_text": document.get("query_text", ""),
            "created_at": document.get("created_at", _utc_now_iso()),
            "recommendations": document.get("recommendations", []),
        }

    def get_profile(self, profile_id: str = DEFAULT_PROFILE_ID) -> dict[str, Any]:
        document = self.profiles.find_one({"profile_id": profile_id}, {"_id": 0})
        if document:
            return document

        user = self.get_user_by_id(profile_id)
        if user:
            profile = build_default_profile(
                profile_id=profile_id,
                display_name=user["displayName"],
                username=user["username"],
                email=user["email"],
            )
        else:
            profile = build_default_profile(profile_id=profile_id)

        self.profiles.update_one(
            {"profile_id": profile_id},
            {"$setOnInsert": profile},
            upsert=True,
        )
        return profile

    def save_profile(
        self,
        payload: dict[str, Any],
        profile_id: str = DEFAULT_PROFILE_ID,
    ) -> dict[str, Any]:
        merged = {**self.get_profile(profile_id), **payload, "profile_id": profile_id}
        self.profiles.update_one(
            {"profile_id": profile_id},
            {"$set": merged},
            upsert=True,
        )
        return self.get_profile(profile_id)

    def create_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        email_lower = payload["email"].strip().lower()
        username_lower = payload["username"].strip().lower()

        if self.users.find_one({"email_lower": email_lower}, {"_id": 1}):
            raise ValueError("An account with this email already exists.")

        if self.users.find_one({"username_lower": username_lower}, {"_id": 1}):
            raise ValueError("That username is already taken.")

        user_id = token_hex(12)
        document = {
            "user_id": user_id,
            "displayName": payload["displayName"].strip(),
            "username": payload["username"].strip(),
            "email": payload["email"].strip(),
            "email_lower": email_lower,
            "username_lower": username_lower,
            "password_hash": payload["password_hash"],
            "password_salt": payload["password_salt"],
            "created_at": _utc_now_iso(),
        }
        self.users.insert_one(document)
        self.get_profile(user_id)
        return _sanitize_user(document)

    def get_user_by_identifier(self, identifier: str) -> dict[str, Any] | None:
        normalized = identifier.strip().lower()
        return self.users.find_one(
            {"$or": [{"email_lower": normalized}, {"username_lower": normalized}]},
            {"_id": 0},
        )

    def get_user_by_id(self, user_id: str) -> dict[str, Any] | None:
        return self.users.find_one({"user_id": user_id}, {"_id": 0})


def get_store() -> SQLiteStore | MongoStore:
    global _store
    if _store is not None:
        return _store

    settings = get_settings()
    if settings.storage_backend.lower() == "mongodb" and settings.mongodb_uri:
        store = MongoStore()
    else:
        store = SQLiteStore()

    store.init()
    _store = store
    return _store

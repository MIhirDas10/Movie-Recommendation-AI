"""Render/uvicorn compatibility entrypoint.

The actual FastAPI app lives in src/movie_recommender/api/main.py. Keeping this
thin shim makes start commands like `uvicorn main:app` work from the repo root.
"""

from movie_recommender.api.main import app

__all__ = ["app"]

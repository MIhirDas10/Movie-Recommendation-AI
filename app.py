"""Alternative uvicorn compatibility entrypoint for hosts expecting app:app."""

from movie_recommender.api.main import app

__all__ = ["app"]

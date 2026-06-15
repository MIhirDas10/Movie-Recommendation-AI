"""Retrieve candidate movies from ChromaDB for a natural-language query."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from movie_recommender.config import get_settings
from movie_recommender.embeddings.embedder import Embedder


@lru_cache(maxsize=1)
def _get_embedder() -> Embedder:
    return Embedder()


@lru_cache(maxsize=1)
def _get_collection() -> Any:
    import chromadb

    settings = get_settings()
    client = chromadb.PersistentClient(path=str(settings.chroma_persist_dir))
    return client.get_or_create_collection(name=settings.chroma_collection_name)


def retrieve_movies(query: str, k: int = 5) -> list[dict[str, Any]]:
    query_vector = _get_embedder().encode([query])
    results = _get_collection().query(
        query_embeddings=query_vector,
        n_results=k,
        include=["metadatas", "distances"],
    )

    movies: list[dict[str, Any]] = []
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]
    for metadata, distance in zip(metadatas, distances):
        movie = dict(metadata)
        movie["score"] = round(1 - float(distance), 4)
        movies.append(movie)
    return movies


if __name__ == "__main__":
    for movie in retrieve_movies("dark psychological thriller"):
        print(f"{movie.get('title')} ({movie.get('year')}) | {movie.get('genres_str')}")

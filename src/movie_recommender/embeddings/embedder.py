from __future__ import annotations

import numpy as np

from movie_recommender.config import get_settings
from movie_recommender.logging_config import get_logger

log = get_logger(__name__) # creating a logger instance

class Embedder:
    def __init__(self, model_name: str | None = None, device: str | None = None):
        settings = get_settings()
        self.model_name = model_name or settings.embedding_model
        self.device = device or settings.embedding_device
        log.info(f"loading embedding model '{self.model_name}' on device '{self.device}'")

        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(self.model_name, device = self.device) # to generate vector embedding
        self.dimension = self.model.get_sentence_embedding_dimension()
        log.info("embedding model is ready", dimension=self.dimension)

    def encode(self, texts: list[str], batch_size: int | None = None) -> np.ndarray:
        settings = get_settings()
        bs = batch_size or settings.embedding_batch_size

        log.info("encoding texts", count=len(texts), batch_size=bs)
        vectors = self.model.encode(
            texts,
            batch_size=bs,
            show_progress_bar=True,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        log.info("encoding complete", shape=list(vectors.shape))
        return vectors.astype(np.float32)
    
    def encode_query(self, query: str) -> np.ndarray:
        # returns 1D array of shape coz single query
        return self.encode([query])[0]

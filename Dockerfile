FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code and pre-indexed database
COPY app.py main.py ./
COPY src ./src
COPY scripts ./scripts
COPY data ./data
COPY chroma_storage ./chroma_storage

# Install the package or just add to PYTHONPATH
ENV PYTHONPATH=/app:/app/src

# Expose port
EXPOSE 8000

# Command to run the application
CMD ["sh", "-c", "uvicorn movie_recommender.api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]

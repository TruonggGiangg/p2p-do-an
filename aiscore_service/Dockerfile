FROM python:3.11-slim-bookworm

WORKDIR /app

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8001

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy application
COPY . /app

# NOTE: train_model.py is designed for Google Colab.
# Pre-trained model artifacts must exist in models/ directory.
# If models/ is empty, the service will attempt to import train_model
# which will fail in Docker (no Google Drive mount).
# Solution: Train on Colab first, then copy models/ into the build context.

EXPOSE 8001

# Run with Uvicorn in production
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]

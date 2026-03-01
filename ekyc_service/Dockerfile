FROM python:3.11-slim-bookworm AS builder

WORKDIR /app

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=20 \
    PIP_INDEX_URL=https://pypi.org/simple \
    POETRY_INSTALLER_MAX_WORKERS=1 \
    POETRY_CACHE_DIR=/tmp/poetry-cache

RUN python -m pip install --upgrade pip setuptools wheel
RUN pip install poetry
RUN pip install gunicorn
# Install system dependencies
RUN apt-get update && apt-get install -y \
    cmake build-essential pkg-config \
    libglib2.0-0 libsm6 libxext6 libxrender1 libgl1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy lockfiles first to leverage Docker layer cache
COPY pyproject.toml poetry.lock /app/

# Install project dependencies using Poetry
# Chúng ta đã định nghĩa pytorch-cpu source trong pyproject.toml 
# nên poetry sẽ tự động cài đúng bản CPU cực nhanh.
RUN poetry config virtualenvs.create false \
    && poetry lock --no-ansi --no-interaction \
    && poetry install --no-root --no-interaction --no-ansi

# Copy application source after deps are cached
COPY . /app

# Expose the port Gunicorn will listen on
EXPOSE 8000

# Command to run the Gunicorn WSGI server.
CMD ["gunicorn", "-c", "gunicorn_config.py", "wsgi:application"]

FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app/backend

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
        libzbar0 \
        tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY backend/pyproject.toml backend/README.md ./
COPY backend/apps ./apps
COPY backend/config ./config
COPY backend/manage.py ./manage.py
COPY backend/tests ./tests

RUN pip install --upgrade pip setuptools wheel \
    && pip install -e ".[dev]"

ARG APP_ENV=development
ENV APP_ENV=${APP_ENV}

EXPOSE 8000

CMD ["sh", "-c", "if [ \"$APP_ENV\" = \"production\" ]; then exec gunicorn config.wsgi:application --bind 0.0.0.0:8000; else exec python manage.py runserver 0.0.0.0:8000; fi"]

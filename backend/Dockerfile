FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app/backend

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
        libzbar0 \
        tesseract-ocr \
        gosu \
    && rm -rf /var/lib/apt/lists/*

# Copy metadata first and stub packages so pip install stays cached unless deps change.
COPY backend/pyproject.toml backend/README.md ./
RUN mkdir -p apps config tests \
    && touch apps/__init__.py config/__init__.py tests/__init__.py manage.py

ARG APP_ENV=development
ENV APP_ENV=${APP_ENV}

EXPOSE 8000


FROM base AS development

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip setuptools wheel \
    && pip install -e ".[dev]"

COPY backend/apps ./apps
COPY backend/config ./config
COPY backend/manage.py ./manage.py
COPY backend/tests ./tests

CMD ["sh", "-c", "if [ \"$APP_ENV\" = \"production\" ]; then exec gunicorn config.wsgi:application --bind 0.0.0.0:8000; else exec python manage.py runserver 0.0.0.0:8000; fi"]


FROM base AS production

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip setuptools wheel \
    && pip install -e .

COPY backend/apps ./apps
COPY backend/config ./config
COPY backend/manage.py ./manage.py
COPY backend/tests ./tests
COPY docker/backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && groupadd --system appuser \
    && useradd --system --gid appuser --home /home/appuser --create-home appuser \
    && mkdir -p /app/backend/staticfiles /app/backend/logs /app/backend/media /var/lib/celery \
    && chown -R appuser:appuser /app /var/lib/celery

ENTRYPOINT ["/entrypoint.sh"]
CMD ["web"]

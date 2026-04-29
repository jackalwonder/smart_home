FROM python:3.12-slim@sha256:46cb7cc2877e60fbd5e21a9ae6115c30ace7a077b9f8772da879e4590c18c2e3

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app/backend

WORKDIR /app/backend

COPY pyproject.toml ./
COPY requirements.lock ./
COPY alembic.ini ./
COPY alembic ./alembic
COPY scripts ./scripts
COPY src ./src
COPY 家庭智能中控_Web_App_PostgreSQL首版DDL_v2.4.sql /app/家庭智能中控_Web_App_PostgreSQL首版DDL_v2.4.sql
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN pip install --upgrade pip \
    && pip install --requirement requirements.lock \
    && pip install --no-deps .
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

EXPOSE 8000

CMD ["sh", "./docker-entrypoint.sh"]

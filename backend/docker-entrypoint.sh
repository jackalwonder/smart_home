#!/bin/sh
set -e

alembic upgrade head
python scripts/bootstrap_dev_data.py

exec uvicorn src.main:app --host 0.0.0.0 --port 8000

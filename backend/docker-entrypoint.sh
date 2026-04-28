#!/bin/sh
set -e

alembic upgrade head

case "${BOOTSTRAP_DEV_DATA:-false}" in
  true|1|yes)
    case "${APP_ENV:-local}" in
      local|dev|development|test)
        python scripts/bootstrap_dev_data.py
        ;;
      *)
        echo "BOOTSTRAP_DEV_DATA is only allowed for local/dev/test environments." >&2
        exit 1
        ;;
    esac
    ;;
esac

exec uvicorn src.main:app --host 0.0.0.0 --port 8000

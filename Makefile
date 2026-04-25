.PHONY: check backend-check frontend-check

BACKEND_PYTHON := $(shell [ -x backend/.venv/bin/python ] && echo .venv/bin/python || echo python3)

check: backend-check frontend-check

backend-check:
	cd backend && $(BACKEND_PYTHON) -m ruff check src tests
	cd backend && $(BACKEND_PYTHON) -m pytest tests/unit -q
	cd backend && $(BACKEND_PYTHON) -m pytest tests/integration -q

frontend-check:
	cd frontend && npm run lint
	cd frontend && npm run format:check
	cd frontend && npm run typecheck
	cd frontend && npm test
	cd frontend && npm run build

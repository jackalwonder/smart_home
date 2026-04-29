.PHONY: check contract-check backend-check frontend-check smoke

BACKEND_PYTHON := $(shell [ -x backend/.venv/bin/python ] && echo .venv/bin/python || echo python3)

check: contract-check backend-check frontend-check

contract-check:
	cd frontend && npm run generate:api-types
	git diff --exit-code -- backend/openapi.json backend/realtime.schema.json frontend/src/api/types.generated.ts frontend/src/ws/realtime.generated.ts

backend-check:
	cd backend && $(BACKEND_PYTHON) -m ruff check src tests
	cd backend && $(BACKEND_PYTHON) -m pip_audit --requirement requirements.lock --strict
	cd backend && $(BACKEND_PYTHON) -m pytest tests/unit -q
	cd backend && $(BACKEND_PYTHON) -m pytest tests/integration -q

frontend-check:
	cd frontend && npm run lint
	cd frontend && npm run format:check
	cd frontend && npm run typecheck
	cd frontend && npm test
	cd frontend && npm run build

smoke:
	cd frontend && npm run test:e2e

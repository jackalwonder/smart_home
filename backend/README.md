# Smart Home Backend

## Local Python

Use Python 3.12 for local backend development and test runs. The repository-level
`.python-version` matches the GitHub Actions runtime, so tools such as `pyenv`
or `mise` should select Python 3.12 automatically.

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install ".[dev]"
```

Run the same backend checks as CI:

```bash
python -m ruff check src tests
python -m pytest tests/unit -q
python -m pytest tests/integration -q
```

Python 3.14 compatibility is not a release target for this branch. If local
3.14 test runs emit `pytest-asyncio` deprecation warnings, switch to Python 3.12
before treating those warnings as product regressions.

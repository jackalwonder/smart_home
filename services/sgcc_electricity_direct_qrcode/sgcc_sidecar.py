from __future__ import annotations

import json
import logging
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
DATA_DIR = Path(os.getenv("SGCC_DATA_DIR", "/data"))
QR_CODE_FILE = Path(os.getenv("SGCC_QR_CODE_FILE", str(DATA_DIR / "login_qr_code.png")))
CACHE_FILE = Path(os.getenv("SGCC_CACHE_FILE", str(DATA_DIR / "sgcc_cache.json")))
QR_CODE_TTL_SECONDS = int(os.getenv("SGCC_QR_CODE_TTL_SECONDS", "60"))

app = FastAPI(title="SGCC Electricity Sidecar")
_job_lock = threading.Lock()
_current_job: dict[str, object] | None = None
_last_job: dict[str, object] | None = None


class TaskStartResponse(BaseModel):
    accepted: bool
    state: str
    job: dict[str, object] | None
    message: str


@app.get("/healthz")
def healthz() -> dict[str, object]:
    return {"status": "ok"}


@app.get("/api/v1/sgcc/status")
def get_status() -> dict[str, object]:
    return _build_status()


@app.get("/api/v1/sgcc/qrcode")
def get_qrcode() -> FileResponse:
    if not QR_CODE_FILE.exists() or not QR_CODE_FILE.is_file():
        raise HTTPException(status_code=404, detail="SGCC QR code is not ready.")
    if QR_CODE_FILE.read_bytes()[: len(PNG_SIGNATURE)] != PNG_SIGNATURE:
        raise HTTPException(status_code=404, detail="SGCC QR code is not a PNG.")
    return FileResponse(QR_CODE_FILE, media_type="image/png")


@app.post("/api/v1/sgcc/login", response_model=TaskStartResponse)
def start_login() -> TaskStartResponse:
    try:
        if QR_CODE_FILE.exists() and QR_CODE_FILE.is_file():
            QR_CODE_FILE.unlink()
    except OSError:
        logging.exception("failed to remove previous SGCC QR code")
    return _start_job("LOGIN", session_first=False)


@app.post("/api/v1/sgcc/fetch", response_model=TaskStartResponse)
def start_fetch() -> TaskStartResponse:
    return _start_job("FETCH", session_first=True)


def _start_job(kind: str, *, session_first: bool) -> TaskStartResponse:
    global _current_job
    with _job_lock:
        if _current_job is not None:
            return TaskStartResponse(
                accepted=False,
                state="RUNNING",
                job=dict(_current_job),
                message="SGCC task is already running.",
            )
        now = _utc_now()
        _current_job = {
            "job_id": str(uuid4()),
            "kind": kind,
            "state": "RUNNING",
            "started_at": now,
            "phase": "STARTING",
            "session_first": session_first,
            "finished_at": None,
            "last_error": None,
        }
        job = dict(_current_job)

    thread = threading.Thread(
        target=_run_job,
        args=(job["job_id"], kind, session_first),
        daemon=True,
    )
    thread.start()
    return TaskStartResponse(
        accepted=True,
        state="RUNNING",
        job=job,
        message="SGCC task started.",
    )


def _run_job(job_id: object, kind: str, session_first: bool) -> None:
    global _current_job, _last_job
    error: str | None = None
    cache_mtime_before = _mtime(CACHE_FILE)
    qrcode_mtime_before = _mtime(QR_CODE_FILE)
    try:
        _set_job_phase(job_id, "LOGIN_RUNNING" if not session_first else "FETCHING_DATA")
        _run_sgcc_fetch(session_first=session_first)
        if (
            _mtime(QR_CODE_FILE) > qrcode_mtime_before
            and _mtime(CACHE_FILE) <= cache_mtime_before
        ):
            error = "LOGIN_REQUIRED"
            _set_job_phase(job_id, "WAITING_FOR_SCAN")
        else:
            _set_job_phase(job_id, "DATA_READY")
    except Exception as exc:  # pragma: no cover - defensive sidecar boundary
        error = str(exc)
        logging.exception("SGCC %s task failed", kind)
    finished_at = _utc_now()
    with _job_lock:
        job = dict(_current_job or {})
        if job.get("job_id") != job_id:
            return
        job.update(
            {
                "state": "FAILED" if error else "COMPLETED",
                "finished_at": finished_at,
                "phase": "FAILED" if error else "DATA_READY",
                "last_error": error,
            }
        )
        _last_job = job
        _current_job = None


def _run_sgcc_fetch(*, session_first: bool) -> None:
    os.environ["DIRECT_QRCODE_LOGIN"] = "true"
    os.environ["SGCC_SESSION_FIRST"] = "true" if session_first else "false"
    os.environ.setdefault("PYTHON_IN_DOCKER", "true")

    import main
    from data_fetcher import DataFetcher
    from error_watcher import ErrorWatcher

    main.logger_init(os.getenv("LOG_LEVEL", "INFO"))
    main.RETRY_TIMES_LIMIT = int(os.getenv("RETRY_TIMES_LIMIT", "5"))
    ErrorWatcher.init(root_dir="/data/errors")
    main.run_task(DataFetcher(os.getenv("PHONE_NUMBER"), os.getenv("PASSWORD")))


def _build_status() -> dict[str, object]:
    with _job_lock:
        current_job = dict(_current_job) if _current_job is not None else None
        last_job = dict(_last_job) if _last_job is not None else None
    return {
        "state": "RUNNING" if current_job is not None else "IDLE",
        "qrcode": _qrcode_status(),
        "accounts": _read_cached_accounts(),
        "job": current_job or last_job,
        "message": "SGCC task is running." if current_job is not None else "SGCC sidecar is idle.",
    }


def _set_job_phase(job_id: object, phase: str) -> None:
    with _job_lock:
        if _current_job is None or _current_job.get("job_id") != job_id:
            return
        _current_job["phase"] = phase


def _qrcode_status() -> dict[str, object]:
    if not QR_CODE_FILE.exists() or not QR_CODE_FILE.is_file():
        return {
            "available": False,
            "status": "PENDING",
            "image_url": None,
            "updated_at": None,
            "expires_at": None,
            "age_seconds": None,
            "file_size_bytes": None,
            "mime_type": None,
            "message": "Waiting for SGCC login QR code.",
        }
    stat = QR_CODE_FILE.stat()
    updated_at = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
    age_seconds = max(0, int((datetime.now(timezone.utc) - updated_at).total_seconds()))
    signature = QR_CODE_FILE.read_bytes()[: len(PNG_SIGNATURE)]
    is_png = signature == PNG_SIGNATURE
    expires_at = datetime.fromtimestamp(
        updated_at.timestamp() + QR_CODE_TTL_SECONDS,
        tz=timezone.utc,
    )
    if not is_png:
        status = "PENDING"
        available = False
        message = "The current SGCC QR code file is not a ready PNG yet."
        mime_type = None
    elif age_seconds > QR_CODE_TTL_SECONDS:
        status = "EXPIRED"
        available = False
        message = "The current SGCC QR code has expired."
        mime_type = "image/png"
    else:
        status = "READY"
        available = True
        message = "SGCC QR code is ready."
        mime_type = "image/png"
    return {
        "available": available,
        "status": status,
        "image_url": "/api/v1/sgcc/qrcode" if available else None,
        "updated_at": updated_at.isoformat(),
        "expires_at": expires_at.isoformat(),
        "age_seconds": age_seconds,
        "file_size_bytes": stat.st_size,
        "mime_type": mime_type,
        "message": message,
    }


def _read_cached_accounts() -> list[dict[str, str]]:
    if not CACHE_FILE.exists() or not CACHE_FILE.is_file():
        return []
    try:
        payload = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(payload, dict):
        return []

    accounts: list[dict[str, str]] = []
    for raw_account_id, raw_value in payload.items():
        account_id = _clean_account_id(raw_account_id)
        if not account_id or not isinstance(raw_value, dict):
            continue
        timestamp = raw_value.get("timestamp")
        accounts.append(
            {
                "account_id": account_id,
                "timestamp": str(timestamp).strip() if timestamp else "",
            }
        )
    return sorted(accounts, key=lambda item: item["timestamp"], reverse=True)


def _clean_account_id(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = re.sub(r"[^0-9A-Za-z_-]+", "", value.strip())
    return cleaned or None


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0

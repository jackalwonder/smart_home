from __future__ import annotations

import json
import logging
import os
import re
import socket
import threading
import time
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
CHROME_PROFILE_DIR = Path(os.getenv("SGCC_CHROME_PROFILE_DIR", str(DATA_DIR / "chrome-profile")))
KEEPALIVE_ENABLED = os.getenv("SGCC_KEEPALIVE_ENABLED", "true").lower() == "true"
KEEPALIVE_INTERVAL_SECONDS = max(60, int(os.getenv("SGCC_KEEPALIVE_INTERVAL_SECONDS", "480")))
KEEPALIVE_INITIAL_DELAY_SECONDS = max(
    0,
    int(os.getenv("SGCC_KEEPALIVE_INITIAL_DELAY_SECONDS", str(KEEPALIVE_INTERVAL_SECONDS))),
)
KEEPALIVE_PAGE_LOAD_TIMEOUT_SECONDS = max(
    5,
    int(os.getenv("SGCC_KEEPALIVE_PAGE_LOAD_TIMEOUT_SECONDS", "20")),
)
KEEPALIVE_URL = os.getenv(
    "SGCC_KEEPALIVE_URL",
    "https://95598.cn/osgweb/electricityCharge",
)

app = FastAPI(title="SGCC Electricity Sidecar")
_job_lock = threading.Lock()
_webdriver_lock = threading.Lock()
_keepalive_state_lock = threading.Lock()
_current_job: dict[str, object] | None = None
_last_job: dict[str, object] | None = None
_persistent_webdriver: object | None = None
_keepalive_thread_started = False
_last_keepalive: dict[str, object] = {
    "enabled": KEEPALIVE_ENABLED,
    "interval_seconds": KEEPALIVE_INTERVAL_SECONDS,
    "last_started_at": None,
    "last_finished_at": None,
    "last_result": None,
    "last_error": None,
}


class TaskStartResponse(BaseModel):
    accepted: bool
    state: str
    job: dict[str, object] | None
    message: str


@app.on_event("startup")
def start_keepalive_worker() -> None:
    if KEEPALIVE_ENABLED:
        _start_keepalive_thread_once()


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


@app.post("/api/v1/sgcc/republish")
def republish_cached_states() -> dict[str, object]:
    try:
        published_count = _republish_cached_states()
    except Exception as exc:  # pragma: no cover - defensive sidecar boundary
        logging.exception("SGCC cache republish failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if published_count == 0:
        raise HTTPException(status_code=404, detail="No SGCC cache data was republished.")
    return {
        "accepted": True,
        "state": "COMPLETED",
        "published_count": published_count,
        "message": "SGCC cached sensor states were republished to Home Assistant.",
        "accounts": _read_cached_accounts(),
    }


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
    success_phase = "SESSION_READY" if kind == "LOGIN" else "DATA_READY"
    try:
        if kind == "LOGIN":
            _set_job_phase(job_id, "LOGIN_RUNNING")
            _run_sgcc_login_only(job_id=job_id)
            _set_job_phase(job_id, success_phase)
        else:
            _set_job_phase(job_id, "FETCHING_DATA")
            _run_sgcc_fetch(job_id=job_id, session_first=session_first)
            if _mtime(CACHE_FILE) <= cache_mtime_before:
                error = "LOGIN_REQUIRED"
                _set_job_phase(job_id, "WAITING_FOR_SCAN")
            else:
                _set_job_phase(job_id, success_phase)
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
                "phase": "FAILED" if error else success_phase,
                "last_error": error,
            }
        )
        _last_job = job
        _current_job = None


def _run_sgcc_login_only(*, job_id: object) -> None:
    os.environ["DIRECT_QRCODE_LOGIN"] = "true"
    os.environ["SGCC_SESSION_FIRST"] = "false"
    os.environ.setdefault("PYTHON_IN_DOCKER", "true")
    os.environ.setdefault("SGCC_CHROME_PROFILE_DIR", str(CHROME_PROFILE_DIR))
    _cleanup_stale_chrome_profile_lock()

    import main
    from data_fetcher import DataFetcher
    from error_watcher import ErrorWatcher

    _patch_persistent_webdriver(DataFetcher)
    _patch_phase_aware_qr_login(DataFetcher, job_id, next_phase="SESSION_READY")

    main.logger_init(os.getenv("LOG_LEVEL", "INFO"))
    main.RETRY_TIMES_LIMIT = int(os.getenv("RETRY_TIMES_LIMIT", "5"))
    ErrorWatcher.init(root_dir="/data/errors")

    fetcher = DataFetcher(os.getenv("PHONE_NUMBER"), os.getenv("PASSWORD"))
    driver = fetcher._get_webdriver()
    try:
        ErrorWatcher.instance().set_driver(driver)
    except Exception:
        logging.debug("failed to attach SGCC login-only driver to ErrorWatcher", exc_info=True)
    try:
        driver.maximize_window()
    except Exception:
        pass
    logged_in = fetcher._direct_qr_login(driver)
    if not logged_in:
        _set_job_phase(job_id, "WAITING_FOR_SCAN")
        raise RuntimeError("LOGIN_REQUIRED")


def _run_sgcc_fetch(*, job_id: object, session_first: bool) -> None:
    os.environ["DIRECT_QRCODE_LOGIN"] = "true"
    os.environ["SGCC_SESSION_FIRST"] = "true" if session_first else "false"
    os.environ.setdefault("PYTHON_IN_DOCKER", "true")
    os.environ.setdefault("SGCC_CHROME_PROFILE_DIR", str(CHROME_PROFILE_DIR))
    _cleanup_stale_chrome_profile_lock()

    import main
    from data_fetcher import DataFetcher
    from error_watcher import ErrorWatcher

    _patch_persistent_webdriver(DataFetcher)
    _patch_phase_aware_qr_login(DataFetcher, job_id, next_phase="FETCHING_DATA")

    main.logger_init(os.getenv("LOG_LEVEL", "INFO"))
    main.RETRY_TIMES_LIMIT = int(os.getenv("RETRY_TIMES_LIMIT", "5"))
    ErrorWatcher.init(root_dir="/data/errors")
    main.run_task(DataFetcher(os.getenv("PHONE_NUMBER"), os.getenv("PASSWORD")))


def _patch_persistent_webdriver(data_fetcher_type: type[object]) -> None:
    original_get_webdriver = getattr(
        data_fetcher_type,
        "_codex_original_get_webdriver",
        data_fetcher_type._get_webdriver,
    )
    data_fetcher_type._codex_original_get_webdriver = original_get_webdriver

    def persistent_get_webdriver(self: object) -> object:
        return _get_or_create_persistent_webdriver(
            lambda: original_get_webdriver(self),
        )

    data_fetcher_type._get_webdriver = persistent_get_webdriver


def _get_or_create_persistent_webdriver(create_driver: object) -> object:
    global _persistent_webdriver
    with _webdriver_lock:
        if _webdriver_is_alive(_persistent_webdriver):
            logging.info("reuse persistent SGCC Chromium browser session")
            return _persistent_webdriver

        _close_persistent_webdriver()
        _cleanup_stale_chrome_profile_lock()
        driver = create_driver()
        _persistent_webdriver = _keep_webdriver_alive(driver)
        logging.info("created persistent SGCC Chromium browser session")
        return _persistent_webdriver


def _start_keepalive_thread_once() -> None:
    global _keepalive_thread_started
    with _keepalive_state_lock:
        if _keepalive_thread_started:
            return
        _keepalive_thread_started = True
    thread = threading.Thread(target=_keepalive_loop, name="sgcc-keepalive", daemon=True)
    thread.start()
    logging.info(
        "SGCC keepalive enabled: interval=%ss initial_delay=%ss",
        KEEPALIVE_INTERVAL_SECONDS,
        KEEPALIVE_INITIAL_DELAY_SECONDS,
    )


def _keepalive_loop() -> None:
    if KEEPALIVE_INITIAL_DELAY_SECONDS:
        time.sleep(KEEPALIVE_INITIAL_DELAY_SECONDS)
    while True:
        try:
            _run_keepalive_probe()
        except Exception as exc:  # pragma: no cover - background safety net
            logging.exception("SGCC keepalive probe crashed")
            _update_keepalive_state("FAILED", str(exc))
        time.sleep(KEEPALIVE_INTERVAL_SECONDS)


def _run_keepalive_probe() -> None:
    started_at = _utc_now()
    with _keepalive_state_lock:
        _last_keepalive.update(
            {
                "enabled": KEEPALIVE_ENABLED,
                "interval_seconds": KEEPALIVE_INTERVAL_SECONDS,
                "last_started_at": started_at,
                "last_finished_at": None,
                "last_result": "RUNNING",
                "last_error": None,
            }
        )

    with _job_lock:
        if _current_job is not None:
            _update_keepalive_state("SKIPPED_BUSY", None)
            return

    with _webdriver_lock:
        driver = _persistent_webdriver
        if not _webdriver_is_alive(driver):
            _update_keepalive_state("SKIPPED_NO_SESSION", None)
            return

        try:
            driver.set_page_load_timeout(KEEPALIVE_PAGE_LOAD_TIMEOUT_SECONDS)
        except Exception:
            pass

        try:
            if not _looks_like_sgcc_business_page(driver):
                try:
                    driver.get(KEEPALIVE_URL)
                except Exception as exc:
                    logging.info("SGCC keepalive page load did not fully complete: %s", exc)
                    _stop_page_load(driver)
                time.sleep(2)

            _stop_page_load(driver)
            _perform_light_keepalive_action(driver)
            if _looks_like_sgcc_business_page(driver):
                logging.info("SGCC keepalive succeeded")
                _update_keepalive_state("OK", None)
                return

            logging.info("SGCC keepalive found unavailable login session")
            _update_keepalive_state("LOGIN_REQUIRED", None)
        except Exception as exc:
            logging.info("SGCC keepalive failed: %s", exc)
            _update_keepalive_state("FAILED", str(exc))


def _perform_light_keepalive_action(driver: object) -> None:
    driver.execute_script(
        """
        window.stop();
        window.scrollBy(0, 1);
        window.scrollBy(0, -1);
        document.dispatchEvent(new Event('visibilitychange'));
        return document.readyState;
        """
    )


def _looks_like_sgcc_business_page(driver: object) -> bool:
    try:
        current_url = (driver.current_url or "").lower()
    except Exception:
        current_url = ""
    if "login" in current_url:
        return False

    try:
        from selenium.webdriver.common.by import By
    except Exception:
        return False

    try:
        for selector in ("#login_box", ".sweepCodePic", ".tencent-captcha__mask-layer"):
            try:
                for element in driver.find_elements(By.CSS_SELECTOR, selector):
                    if element.is_displayed():
                        return False
            except Exception:
                continue

        for selector in (".el-dropdown", ".balance_title", ".cff8", ".total"):
            try:
                for element in driver.find_elements(By.CSS_SELECTOR, selector):
                    if element.is_displayed():
                        return True
            except Exception:
                continue
        return False
    except Exception:
        return False


def _stop_page_load(driver: object) -> None:
    try:
        driver.execute_script("window.stop();")
    except Exception:
        pass


def _update_keepalive_state(result: str, error: str | None) -> None:
    with _keepalive_state_lock:
        _last_keepalive.update(
            {
                "enabled": KEEPALIVE_ENABLED,
                "interval_seconds": KEEPALIVE_INTERVAL_SECONDS,
                "last_finished_at": _utc_now(),
                "last_result": result,
                "last_error": error,
            }
        )


def _keep_webdriver_alive(driver: object) -> object:
    if not hasattr(driver, "_codex_original_quit"):
        driver._codex_original_quit = driver.quit

        def keep_alive_quit() -> None:
            logging.info("keep persistent SGCC Chromium browser session alive")

        driver.quit = keep_alive_quit
    return driver


def _webdriver_is_alive(driver: object | None) -> bool:
    if driver is None:
        return False
    try:
        driver.execute_script("return 1")
    except Exception:
        return False
    return True


def _close_persistent_webdriver() -> None:
    global _persistent_webdriver
    driver = _persistent_webdriver
    _persistent_webdriver = None
    if driver is None:
        return
    quit_driver = getattr(driver, "_codex_original_quit", None)
    if quit_driver is None:
        quit_driver = getattr(driver, "quit", None)
    if quit_driver is None:
        return
    try:
        quit_driver()
    except Exception:
        logging.debug("failed to close stale SGCC Chromium browser session", exc_info=True)


def _patch_phase_aware_qr_login(
    data_fetcher_type: type[object],
    job_id: object,
    *,
    next_phase: str,
) -> None:
    original_qr_login = getattr(
        data_fetcher_type,
        "_codex_original_qr_login",
        data_fetcher_type._qr_login,
    )
    data_fetcher_type._codex_original_qr_login = original_qr_login

    def phase_aware_qr_login(self: object, driver: object) -> bool:
        logged_in = original_qr_login(self, driver)
        if logged_in:
            _set_job_phase(job_id, next_phase)
        return logged_in

    data_fetcher_type._qr_login = phase_aware_qr_login


def _cleanup_stale_chrome_profile_lock() -> None:
    lock_path = CHROME_PROFILE_DIR / "SingletonLock"
    if not lock_path.exists() and not lock_path.is_symlink():
        return
    if _chrome_profile_lock_is_active(lock_path):
        return
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        path = CHROME_PROFILE_DIR / name
        try:
            if path.exists() or path.is_symlink():
                path.unlink()
        except OSError:
            logging.exception("failed to remove stale Chromium profile lock %s", path)


def _chrome_profile_lock_is_active(lock_path: Path) -> bool:
    try:
        target = os.readlink(lock_path) if lock_path.is_symlink() else lock_path.read_text()
    except OSError:
        return False
    match = re.search(r"(?P<host>[^-]+)-(?P<pid>\d+)$", target.strip())
    if not match:
        return False
    if match.group("host") != socket.gethostname():
        return False
    try:
        os.kill(int(match.group("pid")), 0)
    except OSError:
        return False
    return True


def _build_status() -> dict[str, object]:
    with _job_lock:
        current_job = dict(_current_job) if _current_job is not None else None
        last_job = dict(_last_job) if _last_job is not None else None
    with _keepalive_state_lock:
        keepalive = dict(_last_keepalive)
    return {
        "state": "RUNNING" if current_job is not None else "IDLE",
        "qrcode": _qrcode_status(),
        "accounts": _read_cached_accounts(),
        "job": current_job or last_job,
        "keepalive": keepalive,
        "message": "SGCC task is running." if current_job is not None else "SGCC sidecar is idle.",
    }


def _set_job_phase(job_id: object, phase: str) -> None:
    with _job_lock:
        if _current_job is None or _current_job.get("job_id") != job_id:
            return
        _current_job["phase"] = phase


def _republish_cached_states() -> int:
    if not CACHE_FILE.exists() or not CACHE_FILE.is_file():
        return 0
    payload = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return 0

    published_count = 0
    for raw_account_id, raw_value in payload.items():
        account_id = _clean_account_id(raw_account_id)
        if not account_id or not isinstance(raw_value, dict):
            continue
        postfix = f"_{account_id[-4:]}"
        if raw_value.get("balance") is not None:
            _publish_sensor_state(
                f"sensor.electricity_charge_balance{postfix}",
                raw_value["balance"],
                {
                    "unit_of_measurement": "CNY",
                    "icon": "mdi:cash",
                    "device_class": "monetary",
                    "state_class": "total",
                },
            )
            published_count += 1
        if raw_value.get("last_daily_usage") is not None:
            _publish_sensor_state(
                f"sensor.last_electricity_usage{postfix}",
                raw_value["last_daily_usage"],
                {
                    "present_date": str(raw_value.get("last_daily_date") or ""),
                    "unit_of_measurement": "kWh",
                    "icon": "mdi:lightning-bolt",
                    "device_class": "energy",
                    "state_class": "total",
                },
            )
            published_count += 1
        if raw_value.get("yearly_usage") is not None:
            _publish_sensor_state(
                f"sensor.yearly_electricity_usage{postfix}",
                raw_value["yearly_usage"],
                {
                    "unit_of_measurement": "kWh",
                    "icon": "mdi:lightning-bolt",
                    "device_class": "energy",
                    "state_class": "total_increasing",
                },
            )
            published_count += 1
        if raw_value.get("yearly_charge") is not None:
            _publish_sensor_state(
                f"sensor.yearly_electricity_charge{postfix}",
                raw_value["yearly_charge"],
                {
                    "unit_of_measurement": "CNY",
                    "icon": "mdi:cash",
                    "device_class": "monetary",
                    "state_class": "total",
                },
            )
            published_count += 1
        if raw_value.get("month_usage") is not None:
            _publish_sensor_state(
                f"sensor.month_electricity_usage{postfix}",
                raw_value["month_usage"],
                {
                    "unit_of_measurement": "kWh",
                    "icon": "mdi:lightning-bolt",
                    "device_class": "energy",
                    "state_class": "total",
                },
            )
            published_count += 1
        if raw_value.get("month_charge") is not None:
            _publish_sensor_state(
                f"sensor.month_electricity_charge{postfix}",
                raw_value["month_charge"],
                {
                    "unit_of_measurement": "CNY",
                    "icon": "mdi:cash",
                    "device_class": "monetary",
                    "state_class": "total",
                },
            )
            published_count += 1
    return published_count


def _publish_sensor_state(
    sensor_name: str,
    state: object,
    attributes: dict[str, object],
) -> None:
    import requests

    hass_url = os.getenv("HASS_URL")
    hass_token = os.getenv("HASS_TOKEN")
    if not hass_url or not hass_token:
        raise RuntimeError("HASS_URL and HASS_TOKEN are required to publish SGCC sensors.")
    base_url = hass_url.rstrip("/")
    response = requests.post(
        f"{base_url}/api/states/{sensor_name}",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {hass_token}",
        },
        json={
            "state": state,
            "unique_id": sensor_name,
            "attributes": attributes,
        },
        timeout=10,
    )
    response.raise_for_status()


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

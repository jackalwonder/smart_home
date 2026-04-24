from __future__ import annotations

import asyncio
import json
import socket
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

import httpx

from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode


@dataclass(frozen=True)
class SgccRuntimeAccount:
    account_id: str
    timestamp: str


@dataclass(frozen=True)
class SgccRuntimeQrCodeStatus:
    available: bool
    status: str
    image_url: str | None
    updated_at: str | None
    expires_at: str | None
    age_seconds: int | None
    file_size_bytes: int | None
    mime_type: str | None
    message: str


@dataclass(frozen=True)
class SgccRuntimeStatus:
    state: str
    qrcode: SgccRuntimeQrCodeStatus | None
    accounts: list[SgccRuntimeAccount]
    job: dict | None
    job_state: str | None
    job_kind: str | None
    job_phase: str | None
    last_error: str | None
    message: str


@dataclass(frozen=True)
class SgccQrCodeImage:
    content: bytes
    mime_type: str


class SgccContainerRestarter:
    async def restart(self) -> None:
        raise NotImplementedError

    async def fetch(self) -> None:
        raise NotImplementedError

    async def get_status(self) -> SgccRuntimeStatus | None:
        return None

    async def get_qrcode(self) -> SgccQrCodeImage | None:
        return None


class HttpSgccRuntimeClient(SgccContainerRestarter):
    def __init__(self, base_url: str, *, timeout_seconds: float = 10.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout_seconds = timeout_seconds

    async def restart(self) -> None:
        await self._post_task("/api/v1/sgcc/login")

    async def fetch(self) -> None:
        await self._post_task("/api/v1/sgcc/fetch")

    async def get_status(self) -> SgccRuntimeStatus | None:
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                response = await client.get(f"{self._base_url}/api/v1/sgcc/status")
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise AppError(
                ErrorCode.INTERNAL_SERVER_ERROR,
                "SGCC sidecar status request failed.",
            ) from exc
        return _parse_runtime_status(payload)

    async def get_qrcode(self) -> SgccQrCodeImage | None:
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                response = await client.get(f"{self._base_url}/api/v1/sgcc/qrcode")
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise AppError(
                ErrorCode.NOT_FOUND,
                "SGCC sidecar QR code is not ready.",
            ) from exc
        mime_type = response.headers.get("content-type", "image/png").split(";", 1)[0]
        return SgccQrCodeImage(content=response.content, mime_type=mime_type or "image/png")

    async def _post_task(self, path: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                response = await client.post(f"{self._base_url}{path}")
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise AppError(
                ErrorCode.INTERNAL_SERVER_ERROR,
                "SGCC sidecar task request failed.",
            ) from exc
        accepted = payload.get("accepted")
        state = str(payload.get("state") or "").upper()
        if accepted is False and state == "RUNNING":
            return
        if accepted is not True:
            raise AppError(
                ErrorCode.INTERNAL_SERVER_ERROR,
                "SGCC sidecar did not accept the task.",
                details={"state": state, "message": payload.get("message")},
            )


class FallbackSgccRuntimeControl(SgccContainerRestarter):
    def __init__(
        self,
        primary: SgccContainerRestarter,
        fallback: SgccContainerRestarter,
    ) -> None:
        self._primary = primary
        self._fallback = fallback

    async def restart(self) -> None:
        try:
            await self._primary.restart()
        except Exception:
            await self._fallback.restart()

    async def fetch(self) -> None:
        try:
            await self._primary.fetch()
        except Exception:
            await self._fallback.fetch()

    async def get_status(self) -> SgccRuntimeStatus | None:
        try:
            return await self._primary.get_status()
        except Exception:
            return await self._fallback.get_status()

    async def get_qrcode(self) -> SgccQrCodeImage | None:
        try:
            return await self._primary.get_qrcode()
        except Exception:
            return await self._fallback.get_qrcode()


class DockerUnixSocketContainerRestarter(SgccContainerRestarter):
    _FETCH_COMMAND = (
        "import os, main; "
        "os.environ['DIRECT_QRCODE_LOGIN']='false'; "
        "from error_watcher import ErrorWatcher; "
        "from data_fetcher import DataFetcher; "
        "main.logger_init(os.getenv('LOG_LEVEL','INFO')); "
        "main.RETRY_TIMES_LIMIT=int(os.getenv('RETRY_TIMES_LIMIT','5')); "
        "ErrorWatcher.init(root_dir='/data/errors'); "
        "main.run_task(DataFetcher(os.getenv('PHONE_NUMBER'), os.getenv('PASSWORD')))"
    )

    def __init__(self, socket_path: str, container_name: str) -> None:
        self._socket_path = socket_path
        self._container_name = container_name

    async def restart(self) -> None:
        await asyncio.to_thread(self._restart_sync)

    async def fetch(self) -> None:
        await asyncio.to_thread(self._fetch_sync)

    def _restart_sync(self) -> None:
        self._ensure_socket_exists()
        target = quote(self._container_name, safe="")
        response = self._docker_request(
            (
                f"POST /containers/{target}/restart?t=0 HTTP/1.1\r\n"
                "Host: docker\r\n"
                "Content-Length: 0\r\n"
                "Connection: close\r\n"
                "\r\n"
            ).encode("ascii"),
            timeout=10,
        )
        status_code, body = _parse_docker_response(response)
        if status_code not in {200, 204, 304}:
            raise AppError(
                ErrorCode.INTERNAL_SERVER_ERROR,
                "Docker failed to restart sgcc_electricity.",
                details={"status_code": status_code, "response": body[:500]},
            )

    def _fetch_sync(self) -> None:
        self._ensure_socket_exists()
        target = quote(self._container_name, safe="")
        exec_body = json.dumps(
            {
                "AttachStdout": False,
                "AttachStderr": False,
                "Tty": False,
                "Cmd": ["python3", "-c", self._FETCH_COMMAND],
            }
        ).encode("utf-8")
        create_response = self._docker_request(
            (
                f"POST /containers/{target}/exec HTTP/1.1\r\n"
                "Host: docker\r\n"
                "Content-Type: application/json\r\n"
                f"Content-Length: {len(exec_body)}\r\n"
                "Connection: close\r\n"
                "\r\n"
            ).encode("ascii")
            + exec_body,
            timeout=10,
        )
        create_status, create_body = _parse_docker_response(create_response)
        if create_status not in {200, 201}:
            raise AppError(
                ErrorCode.INTERNAL_SERVER_ERROR,
                "Docker failed to create sgcc_electricity fetch exec.",
                details={"status_code": create_status, "response": create_body[:500]},
            )
        try:
            exec_id = str(json.loads(create_body)["Id"])
        except (KeyError, TypeError, ValueError) as exc:
            raise AppError(
                ErrorCode.INTERNAL_SERVER_ERROR,
                "Docker returned an invalid sgcc_electricity exec response.",
                details={"response": create_body[:500]},
            ) from exc

        start_body = json.dumps({"Detach": True, "Tty": False}).encode("utf-8")
        start_response = self._docker_request(
            (
                f"POST /exec/{quote(exec_id, safe='')}/start HTTP/1.1\r\n"
                "Host: docker\r\n"
                "Content-Type: application/json\r\n"
                f"Content-Length: {len(start_body)}\r\n"
                "Connection: close\r\n"
                "\r\n"
            ).encode("ascii")
            + start_body,
            timeout=10,
        )
        start_status, start_body_text = _parse_docker_response(start_response)
        if start_status not in {200, 201, 204}:
            raise AppError(
                ErrorCode.INTERNAL_SERVER_ERROR,
                "Docker failed to start sgcc_electricity fetch exec.",
                details={"status_code": start_status, "response": start_body_text[:500]},
            )

    def _ensure_socket_exists(self) -> None:
        socket_path = Path(self._socket_path)
        if not socket_path.exists():
            raise AppError(
                ErrorCode.INVALID_PARAMS,
                "Docker socket is not mounted; cannot control sgcc_electricity.",
                details={"socket_path": self._socket_path},
            )

    def _docker_request(self, request: bytes, *, timeout: int) -> bytes:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(timeout)
            client.connect(self._socket_path)
            client.sendall(request)
            response = bytearray()
            while True:
                chunk = client.recv(65536)
                if not chunk:
                    break
                response.extend(chunk)
        return bytes(response)


def _parse_docker_response(response: bytes) -> tuple[int, str]:
    header_bytes, _, raw_body = response.partition(b"\r\n\r\n")
    status_line = header_bytes.split(b"\r\n", 1)[0].decode(
        "ascii",
        errors="replace",
    )
    parts = status_line.split()
    if len(parts) < 2:
        raise AppError(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Docker returned an invalid response.",
        )
    try:
        status_code = int(parts[1])
    except ValueError as exc:
        raise AppError(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Docker returned an invalid status code.",
            details={"status_line": status_line},
        ) from exc

    headers = header_bytes.decode("iso-8859-1", errors="replace").lower()
    body_bytes = _decode_chunked_body(raw_body) if "transfer-encoding: chunked" in headers else raw_body
    body = body_bytes.decode("utf-8", errors="replace")
    return status_code, body


def _decode_chunked_body(raw_body: bytes) -> bytes:
    output = bytearray()
    index = 0
    while index < len(raw_body):
        line_end = raw_body.find(b"\r\n", index)
        if line_end < 0:
            break
        size_line = raw_body[index:line_end].split(b";", 1)[0]
        try:
            size = int(size_line.strip() or b"0", 16)
        except ValueError:
            return raw_body
        index = line_end + 2
        if size == 0:
            break
        output.extend(raw_body[index : index + size])
        index += size + 2
    return bytes(output)


def _parse_runtime_status(payload: object) -> SgccRuntimeStatus:
    if not isinstance(payload, dict):
        raise AppError(ErrorCode.INTERNAL_SERVER_ERROR, "SGCC sidecar returned invalid status.")
    qrcode = _parse_qrcode_status(payload.get("qrcode"))
    accounts: list[SgccRuntimeAccount] = []
    raw_accounts = payload.get("accounts")
    if isinstance(raw_accounts, list):
        for raw_account in raw_accounts:
            if not isinstance(raw_account, dict):
                continue
            account_id = raw_account.get("account_id")
            if not isinstance(account_id, str) or not account_id.strip():
                continue
            timestamp = raw_account.get("timestamp")
            accounts.append(
                SgccRuntimeAccount(
                    account_id=account_id.strip(),
                    timestamp=str(timestamp).strip() if timestamp else "",
                )
            )
    job = payload.get("job") if isinstance(payload.get("job"), dict) else None
    message = payload.get("message")
    return SgccRuntimeStatus(
        state=str(payload.get("state") or "UNKNOWN"),
        qrcode=qrcode,
        accounts=accounts,
        job=job,
        job_state=_job_value(job, "state"),
        job_kind=_job_value(job, "kind"),
        job_phase=_job_value(job, "phase"),
        last_error=_job_value(job, "last_error"),
        message=str(message).strip() if message else "",
    )


def _parse_qrcode_status(payload: object) -> SgccRuntimeQrCodeStatus | None:
    if not isinstance(payload, dict):
        return None
    message = payload.get("message")
    return SgccRuntimeQrCodeStatus(
        available=bool(payload.get("available")),
        status=str(payload.get("status") or "PENDING"),
        image_url=str(payload.get("image_url")) if payload.get("image_url") else None,
        updated_at=str(payload.get("updated_at")) if payload.get("updated_at") else None,
        expires_at=str(payload.get("expires_at")) if payload.get("expires_at") else None,
        age_seconds=_as_optional_int(payload.get("age_seconds")),
        file_size_bytes=_as_optional_int(payload.get("file_size_bytes")),
        mime_type=str(payload.get("mime_type")) if payload.get("mime_type") else None,
        message=str(message).strip() if message else "",
    )


def _as_optional_int(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _job_value(job: dict | None, key: str) -> str | None:
    if not isinstance(job, dict):
        return None
    value = job.get(key)
    if value is None:
        return None
    text = str(value).strip()
    return text or None

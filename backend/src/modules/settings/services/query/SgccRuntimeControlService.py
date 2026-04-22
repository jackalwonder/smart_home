from __future__ import annotations

import asyncio
import json
import socket
from pathlib import Path
from urllib.parse import quote

from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode


class SgccContainerRestarter:
    async def restart(self) -> None:
        raise NotImplementedError

    async def fetch(self) -> None:
        raise NotImplementedError


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

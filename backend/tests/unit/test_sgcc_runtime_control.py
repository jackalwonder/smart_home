from __future__ import annotations

import httpx
import asyncio

from src.modules.settings.services.query.SgccRuntimeControlService import (
    HttpSgccRuntimeClient,
)


class _CaptureAsyncClient:
    requests: list[dict] = []

    def __init__(self, timeout):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, url):
        self.requests.append({"method": "POST", "url": url, "timeout": self.timeout})
        return httpx.Response(
            200,
            json={"accepted": True, "state": "RUNNING", "job": {"job_id": "job-1"}},
            request=httpx.Request("POST", url),
        )

    async def get(self, url):
        self.requests.append({"method": "GET", "url": url, "timeout": self.timeout})
        if url.endswith("/qrcode"):
            return httpx.Response(
                200,
                content=b"\x89PNG\r\n\x1a\npayload",
                headers={"content-type": "image/png"},
                request=httpx.Request("GET", url),
            )
        return httpx.Response(
            200,
            json={
                "state": "IDLE",
                "qrcode": {
                    "available": True,
                    "status": "READY",
                    "image_url": "/api/v1/sgcc/qrcode",
                    "updated_at": "2026-04-20T08:00:00+00:00",
                    "expires_at": "2026-04-20T08:01:00+00:00",
                    "age_seconds": 5,
                    "file_size_bytes": 12,
                    "mime_type": "image/png",
                    "message": "ready",
                },
                "accounts": [{"account_id": "1503525238170", "timestamp": "2026-04-20"}],
                "job": {
                    "state": "RUNNING",
                    "kind": "LOGIN",
                    "phase": "FETCHING_DATA",
                    "last_error": None,
                },
                "message": "idle",
            },
            request=httpx.Request("GET", url),
        )


def test_http_sgcc_runtime_client_calls_sidecar(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _CaptureAsyncClient)
    _CaptureAsyncClient.requests = []
    client = HttpSgccRuntimeClient("http://sgcc_electricity:8080", timeout_seconds=3)

    async def run():
        await client.fetch()
        await client.restart()
        status = await client.get_status()
        image = await client.get_qrcode()
        return status, image

    status, image = asyncio.run(run())

    assert [request["url"] for request in _CaptureAsyncClient.requests] == [
        "http://sgcc_electricity:8080/api/v1/sgcc/fetch",
        "http://sgcc_electricity:8080/api/v1/sgcc/login",
        "http://sgcc_electricity:8080/api/v1/sgcc/status",
        "http://sgcc_electricity:8080/api/v1/sgcc/qrcode",
    ]
    assert status is not None
    assert status.qrcode is not None
    assert status.qrcode.available is True
    assert status.accounts[0].account_id == "1503525238170"
    assert status.job_state == "RUNNING"
    assert status.job_kind == "LOGIN"
    assert status.job_phase == "FETCHING_DATA"
    assert image is not None
    assert image.content.startswith(b"\x89PNG")

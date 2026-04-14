from __future__ import annotations

from src.app.container import (
    get_device_control_command_service,
    get_device_control_result_query_service,
    get_request_context_service,
)
from src.modules.auth.services.query.RequestContextService import RequestContext
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.modules.device_control.services.command.DeviceControlCommandService import (
    DeviceControlAcceptedView,
)
from src.repositories.read_models.index import DeviceControlResultReadModel


class FakeDeviceControlCommandService:
    async def accept(self, _input):
        return DeviceControlAcceptedView(
            request_id="req-1",
            device_id="device-1",
            accepted=True,
            acceptance_status="ACCEPTED",
            confirmation_type="ACK_DRIVEN",
            accepted_at="2026-04-14T10:00:00+00:00",
            timeout_seconds=30,
            retry_scheduled=False,
            message="Control request accepted",
            result_query_path="/api/v1/device-controls/req-1",
        )


class FakeDeviceControlResultQueryService:
    async def get_result(self, _input):
        return DeviceControlResultReadModel(
            request_id="req-1",
            device_id="device-1",
            action_type="SET_POWER_STATE",
            payload={"target_scope": None, "target_key": None, "value": True, "unit": None},
            acceptance_status="ACCEPTED",
            confirmation_type="ACK_DRIVEN",
            execution_status="SUCCESS",
            retry_count=0,
            final_runtime_state={"power": "ON"},
            error_code=None,
            error_message=None,
            accepted_at="2026-04-14T10:00:00+00:00",
            completed_at="2026-04-14T10:00:05+00:00",
        )


class FakeMissingDeviceControlResultQueryService:
    async def get_result(self, _input):
        raise AppError(
            ErrorCode.CONTROL_REQUEST_NOT_FOUND,
            "control request not found",
        )


class FakeRequestContextService:
    async def resolve_http_request(self, *_args, **_kwargs):
        return RequestContext(home_id="home-1", terminal_id="terminal-1")


def test_device_control_accept_and_query(app, client):
    app.dependency_overrides[get_device_control_command_service] = (
        lambda: FakeDeviceControlCommandService()
    )
    app.dependency_overrides[get_device_control_result_query_service] = (
        lambda: FakeDeviceControlResultQueryService()
    )
    app.dependency_overrides[get_request_context_service] = lambda: FakeRequestContextService()

    post_response = client.post(
        "/api/v1/device-controls",
        json={
            "request_id": "req-1",
            "device_id": "device-1",
            "action_type": "SET_POWER_STATE",
            "payload": {"value": True},
        },
    )
    get_response = client.get("/api/v1/device-controls/req-1")

    assert post_response.status_code == 202
    assert post_response.json()["success"] is True
    assert post_response.json()["data"]["accepted"] is True
    assert post_response.json()["data"]["confirmation_type"] == "ACK_DRIVEN"
    assert post_response.json()["data"]["result_query_path"] == "/api/v1/device-controls/req-1"
    assert get_response.status_code == 200
    assert get_response.json()["success"] is True
    assert get_response.json()["data"]["execution_status"] == "SUCCESS"
    assert get_response.json()["data"]["action_type"] == "SET_POWER_STATE"
    assert get_response.json()["data"]["final_runtime_state"]["power"] == "ON"


def test_device_control_query_not_found_is_wrapped_with_request_specific_error(app, client):
    app.dependency_overrides[get_device_control_result_query_service] = (
        lambda: FakeMissingDeviceControlResultQueryService()
    )
    app.dependency_overrides[get_request_context_service] = lambda: FakeRequestContextService()

    response = client.get("/api/v1/device-controls/req-missing")

    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "CONTROL_REQUEST_NOT_FOUND"
    assert body["error"]["message"] == "control request not found"


def test_request_validation_errors_are_wrapped(client):
    response = client.post(
        "/api/v1/device-controls",
        json={
            "device_id": "device-1",
            "action_type": "SET_POWER_STATE",
            "payload": {"value": True},
        },
    )

    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["data"] is None
    assert body["error"]["code"] == "INVALID_PARAMS"
    assert body["meta"]["trace_id"]

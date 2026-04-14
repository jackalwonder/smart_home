from __future__ import annotations

from dataclasses import dataclass

from src.repositories.query.control.DeviceControlQueryRepository import DeviceControlQueryRepository
from src.repositories.read_models.index import DeviceControlResultReadModel
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode


@dataclass(frozen=True)
class DeviceControlResultQueryInput:
    home_id: str
    request_id: str


class DeviceControlResultQueryService:
    def __init__(self, device_control_query_repository: DeviceControlQueryRepository) -> None:
        self._device_control_query_repository = device_control_query_repository

    async def get_result(self, input: DeviceControlResultQueryInput) -> DeviceControlResultReadModel:
        result = await self._device_control_query_repository.get_control_result(
            input.home_id,
            input.request_id,
        )
        if result is None:
            raise AppError(ErrorCode.CONTROL_REQUEST_NOT_FOUND, "control request not found")
        return result

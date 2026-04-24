from __future__ import annotations

import logging

from src.infrastructure.ha.HaControlGateway import HaControlCommand, HaControlSubmitResult

logger = logging.getLogger(__name__)


class NoopHaControlGateway:
    async def submit_control(self, command: HaControlCommand) -> HaControlSubmitResult:
        logger.info(
            "HA control gateway not wired yet; skipping dispatch for request_id=%s device_id=%s action=%s",
            command.request_id,
            command.device_id,
            command.action_type,
        )
        return HaControlSubmitResult(
            submitted=False,
            status="SKIPPED",
            reason="HA_GATEWAY_NOT_WIRED",
            message="Home Assistant control gateway is not configured.",
        )

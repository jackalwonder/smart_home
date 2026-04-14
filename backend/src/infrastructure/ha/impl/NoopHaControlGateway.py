from __future__ import annotations

import logging

from src.infrastructure.ha.HaControlGateway import HaControlCommand

logger = logging.getLogger(__name__)


class NoopHaControlGateway:
    async def submit_control(self, command: HaControlCommand) -> None:
        logger.info(
            "HA control gateway not wired yet; skipping dispatch for request_id=%s device_id=%s action=%s",
            command.request_id,
            command.device_id,
            command.action_type,
        )

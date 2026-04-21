from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from src.modules.energy.services.EnergyService import EnergyService

logger = logging.getLogger(__name__)


class EnergyAutoRefreshService:
    def __init__(
        self,
        energy_service: EnergyService,
        *,
        enabled: bool,
        hour: int,
        minute: int,
        timezone_name: str,
    ) -> None:
        self._energy_service = energy_service
        self._enabled = enabled
        self._hour = max(0, min(23, hour))
        self._minute = max(0, min(59, minute))
        self._timezone_name = timezone_name
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        if not self._enabled or self._task is not None:
            return
        self._task = asyncio.create_task(self._run_forever())

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        finally:
            self._task = None

    async def run_once(self) -> None:
        try:
            result = await self._energy_service.refresh_all_bound_accounts()
        except Exception:
            logger.exception("Daily energy auto refresh failed")
            return
        logger.info(
            "Daily energy auto refresh completed: refreshed=%s success=%s failed=%s",
            result.refreshed_count,
            result.success_count,
            result.failed_count,
        )

    async def _run_forever(self) -> None:
        while True:
            await asyncio.sleep(self._seconds_until_next_run())
            await self.run_once()

    def _seconds_until_next_run(self) -> float:
        timezone = self._timezone()
        now = datetime.now(timezone)
        next_run = now.replace(
            hour=self._hour,
            minute=self._minute,
            second=0,
            microsecond=0,
        )
        if next_run <= now:
            next_run += timedelta(days=1)
        return max(1.0, (next_run - now).total_seconds())

    def _timezone(self) -> ZoneInfo:
        try:
            return ZoneInfo(self._timezone_name)
        except ZoneInfoNotFoundError:
            logger.warning(
                "Invalid energy auto refresh timezone %s; falling back to Asia/Shanghai",
                self._timezone_name,
            )
            return ZoneInfo("Asia/Shanghai")

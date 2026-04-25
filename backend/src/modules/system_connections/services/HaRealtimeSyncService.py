from __future__ import annotations

import asyncio
import hashlib
import json

from src.infrastructure.ha.HaConnectionGateway import HaConnectionGateway, HaRealtimeEvent
from src.infrastructure.ha.HomeAssistantBootstrapProvider import HomeAssistantBootstrapProvider
from src.infrastructure.security.ConnectionSecretCipher import ConnectionSecretCipher
from src.modules.system_connections.services.HaEntitySyncService import (
    HaEntitySyncService,
    IncrementalStateSyncResult,
)
from src.repositories.base.realtime.WsEventOutboxRepository import (
    NewWsEventOutboxRow,
    WsEventOutboxRepository,
)
from src.repositories.base.realtime.HaRealtimeSyncRepository import (
    HaRealtimeSyncRepository,
)
from src.repositories.base.system.SystemConnectionRepository import (
    SystemConnectionRepository,
    SystemConnectionRow,
    SystemConnectionUpsertRow,
)
from src.shared.kernel.Clock import Clock
from src.shared.kernel.EventIdGenerator import EventIdGenerator
from src.shared.kernel.RepoContext import RepoContext
from src.shared.kernel.UnitOfWork import UnitOfWork

REGISTRY_EVENT_TYPES = {
    "entity_registry_updated",
    "device_registry_updated",
    "area_registry_updated",
}


class HaRealtimeSyncService:
    def __init__(
        self,
        ha_realtime_sync_repository: HaRealtimeSyncRepository,
        unit_of_work: UnitOfWork,
        ha_connection_gateway: HaConnectionGateway,
        ha_entity_sync_service: HaEntitySyncService,
        system_connection_repository: SystemConnectionRepository,
        ws_event_outbox_repository: WsEventOutboxRepository,
        home_assistant_bootstrap_provider: HomeAssistantBootstrapProvider,
        connection_secret_cipher: ConnectionSecretCipher,
        event_id_generator: EventIdGenerator,
        clock: Clock,
    ) -> None:
        self._ha_realtime_sync_repository = ha_realtime_sync_repository
        self._unit_of_work = unit_of_work
        self._ha_connection_gateway = ha_connection_gateway
        self._ha_entity_sync_service = ha_entity_sync_service
        self._system_connection_repository = system_connection_repository
        self._ws_event_outbox_repository = ws_event_outbox_repository
        self._home_assistant_bootstrap_provider = home_assistant_bootstrap_provider
        self._connection_secret_cipher = connection_secret_cipher
        self._event_id_generator = event_id_generator
        self._clock = clock
        self._supervisor_task: asyncio.Task[None] | None = None
        self._home_tasks: dict[str, asyncio.Task[None]] = {}

    def _stable_event_id(self, prefix: str, *parts: str | None) -> str:
        material = "|".join(part or "" for part in parts)
        digest = hashlib.sha1(material.encode("utf-8")).hexdigest()
        return f"{prefix}_{digest}"

    async def start(self) -> None:
        if self._supervisor_task is None or self._supervisor_task.done():
            self._supervisor_task = asyncio.create_task(
                self._supervise(),
                name="ha-realtime-supervisor",
            )

    async def stop(self) -> None:
        tasks = list(self._home_tasks.values())
        self._home_tasks.clear()
        if self._supervisor_task is not None:
            tasks.append(self._supervisor_task)
            self._supervisor_task = None
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def _encrypt_connection(
        self,
        base_url: str,
        auth_payload: dict[str, object],
    ) -> tuple[str | None, str | None]:
        return (
            self._connection_secret_cipher.encrypt(base_url.rstrip("/")),
            self._connection_secret_cipher.encrypt(json.dumps(auth_payload, ensure_ascii=True)),
        )

    async def _list_home_ids(self) -> list[str]:
        return await self._ha_realtime_sync_repository.list_home_ids()

    async def _ensure_connection(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> SystemConnectionRow | None:
        connection = await self._system_connection_repository.find_by_home_and_type(
            home_id,
            "HOME_ASSISTANT",
            ctx=ctx,
        )
        if connection is not None:
            return connection
        bootstrap = self._home_assistant_bootstrap_provider.get_config()
        if bootstrap is None:
            return None
        encrypted_base_url, encrypted_auth_payload = self._encrypt_connection(
            bootstrap.base_url,
            bootstrap.auth_payload,
        )
        return await self._system_connection_repository.upsert(
            SystemConnectionUpsertRow(
                home_id=home_id,
                system_type="HOME_ASSISTANT",
                connection_mode=bootstrap.connection_mode,
                base_url_encrypted=encrypted_base_url,
                auth_payload_encrypted=encrypted_auth_payload,
                auth_configured=True,
                connection_status="DISCONNECTED",
            ),
            ctx=ctx,
        )

    async def _mark_connection_state(
        self,
        home_id: str,
        status: str,
        message: str,
        event_type: str | None = None,
    ) -> None:
        now_iso = self._clock.now().isoformat()

        async def _transaction(tx) -> None:
            connection = await self._ensure_connection(home_id, RepoContext(tx=tx))
            if connection is None:
                return
            await self._system_connection_repository.upsert(
                SystemConnectionUpsertRow(
                    home_id=home_id,
                    system_type=connection.system_type,
                    connection_mode=connection.connection_mode,
                    base_url_encrypted=connection.base_url_encrypted,
                    auth_payload_encrypted=connection.auth_payload_encrypted,
                    auth_configured=connection.auth_configured,
                    connection_status=status,
                    last_test_at=connection.last_test_at,
                    last_test_result=connection.last_test_result,
                    last_sync_at=now_iso,
                    last_sync_result=message,
                ),
                ctx=RepoContext(tx=tx),
            )
            if event_type is not None:
                await self._ws_event_outbox_repository.insert(
                    NewWsEventOutboxRow(
                        home_id=home_id,
                        event_id=self._event_id_generator.next_event_id(),
                        event_type=event_type,
                        change_domain="SUMMARY",
                        snapshot_required=False,
                        payload_json={
                            "home_id": home_id,
                            "connection_status": status,
                            "message": message,
                        },
                        occurred_at=now_iso,
                    ),
                    ctx=RepoContext(tx=tx),
                )

        await self._unit_of_work.run_in_transaction(_transaction)

    async def _full_sync(self, home_id: str) -> None:
        snapshot = await self._ha_connection_gateway.fetch_sync_snapshot(home_id)
        now_iso = self._clock.now().isoformat()

        async def _transaction(tx) -> None:
            connection = await self._ensure_connection(home_id, RepoContext(tx=tx))
            if connection is None:
                return
            summary = await self._ha_entity_sync_service.sync_home(home_id, snapshot, tx)
            await self._system_connection_repository.upsert(
                SystemConnectionUpsertRow(
                    home_id=home_id,
                    system_type=connection.system_type,
                    connection_mode=connection.connection_mode,
                    base_url_encrypted=connection.base_url_encrypted,
                    auth_payload_encrypted=connection.auth_payload_encrypted,
                    auth_configured=connection.auth_configured,
                    connection_status="CONNECTED",
                    last_test_at=connection.last_test_at,
                    last_test_result=connection.last_test_result,
                    last_sync_at=now_iso,
                    last_sync_result=json.dumps(summary.__dict__, ensure_ascii=True),
                ),
                ctx=RepoContext(tx=tx),
            )
            await self._ws_event_outbox_repository.insert(
                NewWsEventOutboxRow(
                    home_id=home_id,
                    event_id=self._event_id_generator.next_event_id(),
                    event_type="summary_updated",
                    change_domain="SUMMARY",
                    snapshot_required=False,
                    payload_json=summary.__dict__,
                    occurred_at=now_iso,
                ),
                ctx=RepoContext(tx=tx),
            )

        await self._unit_of_work.run_in_transaction(_transaction)

    async def _apply_incremental_state_change(
        self,
        home_id: str,
        event: HaRealtimeEvent,
    ) -> IncrementalStateSyncResult | None:
        async def _transaction(tx) -> IncrementalStateSyncResult | None:
            result = await self._ha_entity_sync_service.apply_state_changed(
                home_id=home_id,
                payload=event.payload,
                occurred_at=event.time_fired,
                tx=tx,
            )
            if result is None:
                return None
            await self._ws_event_outbox_repository.insert(
                NewWsEventOutboxRow(
                    home_id=home_id,
                    event_id=self._stable_event_id(
                        "ha_state",
                        home_id,
                        result.event_type,
                        result.device_id,
                        result.entity_id,
                        result.status,
                        result.occurred_at,
                    ),
                    event_type=result.event_type,
                    change_domain="DEVICE_STATE",
                    snapshot_required=False,
                    payload_json={
                        "home_id": home_id,
                        "device_id": result.device_id,
                        "entity_id": result.entity_id,
                        "status": result.status,
                    },
                    occurred_at=result.occurred_at or self._clock.now().isoformat(),
                ),
                ctx=RepoContext(tx=tx),
            )
            return result

        return await self._unit_of_work.run_in_transaction(_transaction)

    async def _handle_event(self, home_id: str, event: HaRealtimeEvent) -> None:
        if event.event_type == "state_changed":
            await self._apply_incremental_state_change(home_id, event)
            return
        if event.event_type in REGISTRY_EVENT_TYPES:
            await self._full_sync(home_id)

    async def _watch_home(self, home_id: str) -> None:
        degraded = False
        while True:
            try:
                await self._full_sync(home_id)
                if degraded:
                    await self._mark_connection_state(
                        home_id,
                        "CONNECTED",
                        "HA realtime stream recovered",
                        event_type="ha_sync_recovered",
                    )
                    degraded = False
                async for event in self._ha_connection_gateway.stream_realtime_events(home_id):
                    await self._handle_event(home_id, event)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                degraded = True
                await self._mark_connection_state(
                    home_id,
                    "DEGRADED",
                    str(exc),
                    event_type="ha_sync_degraded",
                )
                await asyncio.sleep(5)

    async def _supervise(self) -> None:
        while True:
            try:
                current_home_ids = set(await self._list_home_ids())
                for home_id in current_home_ids:
                    task = self._home_tasks.get(home_id)
                    if task is None or task.done():
                        self._home_tasks[home_id] = asyncio.create_task(
                            self._watch_home(home_id),
                            name=f"ha-realtime-{home_id}",
                        )
                stale_home_ids = set(self._home_tasks) - current_home_ids
                for home_id in stale_home_ids:
                    task = self._home_tasks.pop(home_id)
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
                await asyncio.sleep(30)
            except asyncio.CancelledError:
                raise
            except Exception:
                await asyncio.sleep(5)

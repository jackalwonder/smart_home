from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from src.modules.page_assets.services.FloorplanAssetService import FloorplanAssetService
from src.modules.system_connections.services.SystemConnectionService import (
    HomeAssistantCandidateConfig,
    SystemConnectionService,
)
from src.repositories.base.page_assets.PageAssetRepository import (
    PageAssetFileRow,
    PageAssetWriteRow,
)
from src.repositories.base.system.SystemConnectionRepository import SystemConnectionRow


class _Clock:
    def now(self):
        return datetime(2026, 4, 14, 10, 0, 0, tzinfo=timezone.utc)


class _NoopPinGuard:
    async def require_active_session(self, *_args, **_kwargs):
        return None


class _Cipher:
    def encrypt(self, value):
        return value

    def decrypt(self, value):
        return value


class _SettingsVersionRepository:
    async def find_current_by_home(self, *_args, **_kwargs):
        return None


class _UnitOfWork:
    async def run_in_transaction(self, func):
        return await func(SimpleNamespace(session=None))


class _BootstrapProvider:
    def __init__(self, config=None):
        self._config = config

    def get_config(self):
        return self._config


@dataclass
class _Summary:
    device_count: int
    entity_count: int
    room_count: int


class _EntitySyncService:
    async def sync_home(self, *_args, **_kwargs):
        return _Summary(device_count=2, entity_count=3, room_count=1)


class _HaGateway:
    def __init__(self):
        self.test_inputs = []
        self.triggered_reload_home_ids = []

    async def test_connection(self, input):
        self.test_inputs.append(input)
        return SimpleNamespace(success=True, status="CONNECTED", message=None)

    async def trigger_full_reload(self, home_id):
        self.triggered_reload_home_ids.append(home_id)

    async def fetch_sync_snapshot(self, _home_id):
        return SimpleNamespace(states=[], entity_registry=[], device_registry=[], area_registry=[])


class _SystemConnectionRepository:
    def __init__(self, existing_row=None):
        self._existing_row = existing_row
        self.upsert_calls = []

    async def find_by_home_and_type(self, *_args, **_kwargs):
        return self._existing_row

    async def upsert(self, input, ctx=None):
        self.upsert_calls.append((input, ctx))
        updated_at = "2026-04-14T10:00:00+00:00"
        return SystemConnectionRow(
            id="row-1",
            home_id=input.home_id,
            system_type=input.system_type,
            connection_mode=input.connection_mode,
            base_url_encrypted=input.base_url_encrypted,
            auth_payload_encrypted=input.auth_payload_encrypted,
            auth_configured=input.auth_configured,
            connection_status=input.connection_status,
            last_test_at=input.last_test_at,
            last_test_result=input.last_test_result,
            last_sync_at=input.last_sync_at,
            last_sync_result=input.last_sync_result,
            updated_at=updated_at,
        )


def _build_connection_service(*, repository, gateway, bootstrap=None):
    return SystemConnectionService(
        system_connection_repository=repository,
        settings_version_repository=_SettingsVersionRepository(),
        management_pin_guard=_NoopPinGuard(),
        ha_connection_gateway=gateway,
        ha_entity_sync_service=_EntitySyncService(),
        home_assistant_bootstrap_provider=_BootstrapProvider(bootstrap),
        connection_secret_cipher=_Cipher(),
        unit_of_work=_UnitOfWork(),
        clock=_Clock(),
    )


@pytest.mark.asyncio
async def test_candidate_connection_test_does_not_persist_saved_config():
    repository = _SystemConnectionRepository()
    gateway = _HaGateway()
    service = _build_connection_service(repository=repository, gateway=gateway)

    result = await service.test_home_assistant(
        home_id="home-1",
        terminal_id="terminal-1",
        use_saved_config=False,
        candidate_config=HomeAssistantCandidateConfig(
            base_url="https://ha.example.com",
            auth_payload={"access_token": "candidate-token"},
        ),
    )

    assert result.tested is True
    assert gateway.test_inputs[0].base_url == "https://ha.example.com"
    assert gateway.test_inputs[0].auth_payload == {"access_token": "candidate-token"}
    assert repository.upsert_calls == []


@pytest.mark.asyncio
async def test_reload_devices_force_full_sync_calls_gateway():
    existing_row = SystemConnectionRow(
        id="row-1",
        home_id="home-1",
        system_type="HOME_ASSISTANT",
        connection_mode="TOKEN",
        base_url_encrypted="https://ha.example.com",
        auth_payload_encrypted=json.dumps({"access_token": "saved-token"}),
        auth_configured=True,
        connection_status="CONNECTED",
        last_test_at=None,
        last_test_result=None,
        last_sync_at=None,
        last_sync_result=None,
        updated_at="2026-04-14T09:00:00+00:00",
    )
    repository = _SystemConnectionRepository(existing_row=existing_row)
    gateway = _HaGateway()
    service = _build_connection_service(repository=repository, gateway=gateway)

    result = await service.reload_devices(
        home_id="home-1",
        terminal_id="terminal-1",
        force_full_sync=True,
    )

    assert result.accepted is True
    assert gateway.triggered_reload_home_ids == ["home-1"]


class _PageAssetRepository:
    def __init__(self):
        self.floorplan_calls = []
        self.hotspot_icon_calls = []
        self.files = {}

    async def upsert_floorplan_asset(self, input, *, replace_current):
        self.floorplan_calls.append((input, replace_current))
        return PageAssetWriteRow(
            asset_id="asset-existing" if replace_current else "asset-new",
            updated_at="2026-04-14T10:00:00+00:00",
        )

    async def create_hotspot_icon_asset(self, input):
        self.hotspot_icon_calls.append(input)
        return PageAssetWriteRow(
            asset_id="icon-asset-1",
            updated_at="2026-04-14T10:00:00+00:00",
        )

    async def find_asset_file(self, *, home_id, asset_id, asset_type):
        return self.files.get((home_id, asset_id, asset_type))


class _AssetStorage:
    def __init__(self, root):
        self._root = Path(root)
        self.saved_floorplans = []
        self.saved_hotspot_icons = []

    def save_floorplan(self, *, home_id, filename, data, timestamp_token):
        self.saved_floorplans.append((home_id, filename, data, timestamp_token))
        path = self._root / home_id / f"floorplan_{timestamp_token}.bin"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return str(path)

    def save_hotspot_icon(self, *, home_id, filename, data, timestamp_token):
        self.saved_hotspot_icons.append((home_id, filename, data, timestamp_token))
        path = self._root / home_id / "hotspot-icons" / f"hotspot_icon_{timestamp_token}.bin"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return str(path)

    def file_exists(self, path):
        return Path(path).is_file()


def _png_bytes(width: int, height: int) -> bytes:
    data = bytearray(24)
    data[0:8] = b"\x89PNG\r\n\x1a\n"
    data[16:20] = width.to_bytes(4, "big")
    data[20:24] = height.to_bytes(4, "big")
    return bytes(data)


@pytest.mark.asyncio
async def test_floorplan_replace_current_updates_existing_asset(tmp_path):
    repository = _PageAssetRepository()
    storage = _AssetStorage(tmp_path)

    service = FloorplanAssetService(
        page_asset_repository=repository,
        asset_storage=storage,
        management_pin_guard=_NoopPinGuard(),
        clock=_Clock(),
    )

    view = await service.upload_floorplan(
        home_id="home-1",
        terminal_id="terminal-1",
        operator_id="member-1",
        filename="floorplan.png",
        content_type="image/png",
        data=_png_bytes(64, 32),
        replace_current=True,
    )

    assert view.asset_id == "asset-existing"
    assert view.background_image_size == {"width": 64, "height": 32}
    assert repository.floorplan_calls[0][1] is True
    assert repository.floorplan_calls[0][0].mime_type == "image/png"
    assert storage.saved_floorplans[0][0] == "home-1"


@pytest.mark.asyncio
async def test_hotspot_icon_upload_creates_hotspot_icon_asset(tmp_path):
    repository = _PageAssetRepository()
    storage = _AssetStorage(tmp_path)

    service = FloorplanAssetService(
        page_asset_repository=repository,
        asset_storage=storage,
        management_pin_guard=_NoopPinGuard(),
        clock=_Clock(),
    )

    view = await service.upload_hotspot_icon(
        home_id="home-1",
        terminal_id="terminal-1",
        operator_id="member-1",
        filename="fan.svg",
        content_type="image/svg+xml",
        data=b"<svg />",
    )

    assert view.asset_id == "icon-asset-1"
    assert view.icon_asset_url == "/api/v1/page-assets/hotspot-icons/icon-asset-1/file"
    assert repository.hotspot_icon_calls[0].mime_type == "image/svg+xml"
    assert storage.saved_hotspot_icons[0][0] == "home-1"


@pytest.mark.asyncio
async def test_hotspot_icon_upload_rejects_non_image(tmp_path):
    repository = _PageAssetRepository()
    storage = _AssetStorage(tmp_path)
    service = FloorplanAssetService(
        page_asset_repository=repository,
        asset_storage=storage,
        management_pin_guard=_NoopPinGuard(),
        clock=_Clock(),
    )

    with pytest.raises(Exception):
        await service.upload_hotspot_icon(
            home_id="home-1",
            terminal_id="terminal-1",
            operator_id="member-1",
            filename="icon.txt",
            content_type="text/plain",
            data=b"not an image",
        )


@pytest.mark.asyncio
async def test_floorplan_file_uses_repository_and_storage(tmp_path):
    repository = _PageAssetRepository()
    storage = _AssetStorage(tmp_path)
    path = storage.save_floorplan(
        home_id="home-1",
        filename="floorplan.png",
        data=_png_bytes(20, 10),
        timestamp_token="existing",
    )
    repository.files[("home-1", "asset-1", "FLOORPLAN")] = PageAssetFileRow(
        file_url=path,
        mime_type="image/png",
    )
    service = FloorplanAssetService(
        page_asset_repository=repository,
        asset_storage=storage,
        management_pin_guard=_NoopPinGuard(),
        clock=_Clock(),
    )

    view = await service.get_floorplan_file(home_id="home-1", asset_id="asset-1")

    assert view.path == path
    assert view.mime_type == "image/png"

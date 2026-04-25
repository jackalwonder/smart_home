from __future__ import annotations

from functools import lru_cache

from src.modules.settings.services.command.SettingsSaveService import SettingsSaveService
from src.modules.settings.services.query.FavoritesQueryService import FavoritesQueryService
from src.modules.settings.services.query.SgccLoginQrCodeService import (
    SgccLoginQrCodeService,
)
from src.modules.settings.services.query.SgccRuntimeControlService import (
    DockerUnixSocketContainerRestarter,
    FallbackSgccRuntimeControl,
    HttpSgccRuntimeClient,
    SgccContainerRestarter,
)
from src.modules.settings.services.query.SettingsQueryService import SettingsQueryService


def _root():
    from src.app import container

    return container


@lru_cache(maxsize=1)
def get_settings_query_service() -> SettingsQueryService:
    root = _root()
    return SettingsQueryService(
        settings_snapshot_query_repository=root.get_settings_snapshot_query_repository(),
    )


@lru_cache(maxsize=1)
def get_favorites_query_service() -> FavoritesQueryService:
    root = _root()
    return FavoritesQueryService(root.get_favorites_query_repository())


@lru_cache(maxsize=1)
def get_sgcc_login_qr_code_service() -> SgccLoginQrCodeService:
    root = _root()
    return SgccLoginQrCodeService(
        root.get_settings(),
        energy_account_repository=root.get_energy_account_repository(),
        ha_connection_gateway=root.get_ha_connection_gateway(),
        runtime_control=get_sgcc_container_restarter(),
    )


@lru_cache(maxsize=1)
def get_sgcc_container_restarter() -> SgccContainerRestarter:
    root = _root()
    settings = root.get_settings()
    docker_control = DockerUnixSocketContainerRestarter(
        settings.sgcc_docker_socket_path,
        settings.sgcc_docker_container_name,
    )
    if settings.energy_upstream_refresh_mode in {"docker_exec_fetch", "docker_restart"}:
        return docker_control

    sidecar_control = HttpSgccRuntimeClient(
        settings.sgcc_sidecar_base_url,
        timeout_seconds=settings.sgcc_sidecar_timeout_seconds,
    )
    if settings.sgcc_sidecar_fallback_enabled:
        return FallbackSgccRuntimeControl(sidecar_control, docker_control)
    return sidecar_control


@lru_cache(maxsize=1)
def get_settings_save_service() -> SettingsSaveService:
    root = _root()
    return SettingsSaveService(
        unit_of_work=root.get_unit_of_work(),
        settings_version_repository=root.get_settings_version_repository(),
        favorite_devices_repository=root.get_favorite_devices_repository(),
        page_settings_repository=root.get_page_settings_repository(),
        function_settings_repository=root.get_function_settings_repository(),
        ws_event_outbox_repository=root.get_ws_event_outbox_repository(),
        management_pin_guard=root.get_management_pin_guard(),
        version_token_generator=root.get_version_token_generator(),
        event_id_generator=root.get_event_id_generator(),
        clock=root.get_clock(),
    )

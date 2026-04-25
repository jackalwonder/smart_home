from __future__ import annotations

from functools import lru_cache

from src.app.containers import auth_container, core_container, repositories_container
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


@lru_cache(maxsize=1)
def get_settings_query_service() -> SettingsQueryService:
    return SettingsQueryService(
        settings_snapshot_query_repository=repositories_container.get_settings_snapshot_query_repository(),
    )


@lru_cache(maxsize=1)
def get_favorites_query_service() -> FavoritesQueryService:
    return FavoritesQueryService(repositories_container.get_favorites_query_repository())


@lru_cache(maxsize=1)
def get_sgcc_login_qr_code_service() -> SgccLoginQrCodeService:
    return SgccLoginQrCodeService(
        core_container.get_settings(),
        energy_account_repository=repositories_container.get_energy_account_repository(),
        ha_connection_gateway=core_container.get_ha_connection_gateway(),
        runtime_control=get_sgcc_container_restarter(),
    )


@lru_cache(maxsize=1)
def get_sgcc_container_restarter() -> SgccContainerRestarter:
    settings = core_container.get_settings()
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
    return SettingsSaveService(
        unit_of_work=repositories_container.get_unit_of_work(),
        settings_version_repository=repositories_container.get_settings_version_repository(),
        favorite_devices_repository=repositories_container.get_favorite_devices_repository(),
        page_settings_repository=repositories_container.get_page_settings_repository(),
        function_settings_repository=repositories_container.get_function_settings_repository(),
        ws_event_outbox_repository=repositories_container.get_ws_event_outbox_repository(),
        management_pin_guard=auth_container.get_management_pin_guard(),
        version_token_generator=core_container.get_version_token_generator(),
        event_id_generator=core_container.get_event_id_generator(),
        clock=core_container.get_clock(),
    )

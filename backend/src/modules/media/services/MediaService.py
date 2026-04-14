from __future__ import annotations

from src.repositories.base.devices.DeviceControlSchemaRepository import DeviceControlSchemaRepository
from src.repositories.base.devices.DeviceRepository import DeviceRepository
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.repositories.base.devices.DeviceRuntimeStateRepository import DeviceRuntimeStateRepository
from src.repositories.base.media.MediaBindingRepository import MediaBindingRepository, MediaBindingUpsertRow


class MediaService:
    def __init__(
        self,
        media_binding_repository: MediaBindingRepository,
        device_repository: DeviceRepository,
        device_control_schema_repository: DeviceControlSchemaRepository,
        device_runtime_state_repository: DeviceRuntimeStateRepository,
        management_pin_guard: ManagementPinGuard,
    ) -> None:
        self._media_binding_repository = media_binding_repository
        self._device_repository = device_repository
        self._device_control_schema_repository = device_control_schema_repository
        self._device_runtime_state_repository = device_runtime_state_repository
        self._management_pin_guard = management_pin_guard

    async def get_default_media(self, home_id: str) -> dict:
        binding = await self._media_binding_repository.find_by_home_id(home_id)
        if binding is None:
            return {
                "binding_status": "MEDIA_UNSET",
                "availability_status": None,
                "device_id": None,
                "display_name": None,
                "play_state": None,
                "track_title": None,
                "artist": None,
                "cover_url": None,
                "entry_behavior": "OPEN_MEDIA_POPUP",
                "confirmation_type": "PLAYBACK_STATE_DRIVEN",
                "control_schema": [],
            }
        availability = binding.availability_status
        display_name = None
        play_state = None
        track_title = None
        artist = None
        cover_url = None
        control_schema: list[dict] = []
        if binding.device_id is not None:
            device = await self._device_repository.find_by_id(home_id, binding.device_id)
            display_name = device.display_name if device is not None else None
            states = await self._device_runtime_state_repository.find_by_device_ids(home_id, [binding.device_id])
            if states:
                availability = "OFFLINE" if states[0].is_offline else "ONLINE"
                runtime = states[0].runtime_state_json or {}
                play_state = runtime.get("state")
                attrs = runtime.get("attributes", {})
                track_title = attrs.get("media_title")
                artist = attrs.get("media_artist")
                cover_url = attrs.get("entity_picture")
            control_schema = [
                {
                    "action_type": schema.action_type,
                    "target_scope": schema.target_scope,
                    "target_key": schema.target_key,
                    "value_type": schema.value_type,
                    "value_range": schema.value_range_json,
                    "allowed_values": schema.allowed_values_json,
                    "unit": schema.unit,
                    "is_quick_action": schema.is_quick_action,
                    "requires_detail_entry": schema.requires_detail_entry,
                }
                for schema in await self._device_control_schema_repository.list_by_device_id(binding.device_id)
            ]
        return {
            "binding_status": binding.binding_status,
            "availability_status": availability,
            "device_id": binding.device_id,
            "display_name": display_name,
            "play_state": play_state,
            "track_title": track_title,
            "artist": artist,
            "cover_url": cover_url,
            "entry_behavior": "OPEN_MEDIA_POPUP",
            "confirmation_type": "PLAYBACK_STATE_DRIVEN",
            "control_schema": control_schema,
        }

    async def bind_default_media(self, home_id: str, terminal_id: str, device_id: str, member_id: str | None = None) -> dict:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        row = await self._media_binding_repository.upsert(
            MediaBindingUpsertRow(
                home_id=home_id,
                device_id=device_id,
                binding_status="MEDIA_SET",
                availability_status=None,
                updated_by_member_id=member_id,
                updated_by_terminal_id=terminal_id,
            )
        )
        device = await self._device_repository.find_by_id(home_id, device_id)
        runtime_states = await self._device_runtime_state_repository.find_by_device_ids(home_id, [device_id])
        availability = row.availability_status
        if runtime_states:
            availability = "OFFLINE" if runtime_states[0].is_offline else "ONLINE"
        return {
            "saved": True,
            "binding_status": row.binding_status,
            "availability_status": availability,
            "device_id": row.device_id,
            "display_name": device.display_name if device is not None else None,
            "updated_at": row.updated_at,
        }

    async def unbind_default_media(self, home_id: str, terminal_id: str, member_id: str | None = None) -> dict:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        row = await self._media_binding_repository.upsert(
            MediaBindingUpsertRow(
                home_id=home_id,
                device_id=None,
                binding_status="MEDIA_UNSET",
                availability_status=None,
                updated_by_member_id=member_id,
                updated_by_terminal_id=terminal_id,
            )
        )
        return {
            "saved": True,
            "binding_status": row.binding_status,
            "availability_status": row.availability_status,
            "updated_at": row.updated_at,
        }

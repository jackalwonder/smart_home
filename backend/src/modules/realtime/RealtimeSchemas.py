from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import Field, TypeAdapter

from src.shared.http.ApiSchema import ApiSchema


class RealtimeAckMessage(ApiSchema):
    type: Literal["ack"]
    event_id: str


class RealtimeResumeMessage(ApiSchema):
    type: Literal["resume"]
    last_event_id: str | None = None


class RealtimePollMessage(ApiSchema):
    type: Literal["poll"]


RealtimeClientMessage = Annotated[
    RealtimeAckMessage | RealtimeResumeMessage | RealtimePollMessage,
    Field(discriminator="type"),
]


class SettingsUpdatedPayload(ApiSchema):
    settings_version: str
    updated_domains: list[str]
    effective_at: str


class SummaryUpdatedPayload(ApiSchema):
    room_count: int
    entity_count: int
    device_count: int
    linked_entity_count: int


class DeviceStateChangedPayload(ApiSchema):
    home_id: str | None = None
    device_id: str
    entity_id: str | None = None
    status: str | None = None
    related_request_id: str | None = None
    confirmation_type: str | None = None
    execution_status: str | None = None
    runtime_state: dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None


class ConnectionStatusPayload(ApiSchema):
    home_id: str
    connection_status: str
    message: str


class EnergyRefreshPayload(ApiSchema):
    refresh_status: str
    last_error_code: str | None = None
    upstream_triggered: bool = False
    source_updated: bool = False
    source_updated_at: str | None = None
    system_updated_at: str | None = None
    refresh_status_detail: str | None = None


class DraftLockAcquiredPayload(ApiSchema):
    lease_id: str
    terminal_id: str
    lease_expires_at: str


class DraftLockLostPayload(ApiSchema):
    lease_id: str
    terminal_id: str
    lost_reason: Literal["TAKEN_OVER", "LEASE_EXPIRED"]


class DraftTakenOverPayload(ApiSchema):
    previous_terminal_id: str
    new_terminal_id: str
    new_operator_id: str | None = None
    new_lease_id: str
    draft_version: str | None = None


class PublishSucceededPayload(ApiSchema):
    layout_version: str
    effective_at: str
    published_by_terminal_id: str


class BackupRestoreCompletedPayload(ApiSchema):
    backup_id: str
    settings_version: str
    layout_version: str
    audit_id: str
    effective_at: str
    restored_by_terminal_id: str


class VersionConflictDetectedPayload(ApiSchema):
    reason: Literal["EVENT_GAP"]
    last_event_id: str


class RealtimeEventBase(ApiSchema):
    event_id: str
    occurred_at: str
    sequence: int
    home_id: str


class SettingsUpdatedEvent(RealtimeEventBase):
    event_type: Literal["settings_updated"]
    change_domain: Literal["SETTINGS"]
    snapshot_required: Literal[True]
    payload: SettingsUpdatedPayload


class SummaryUpdatedEvent(RealtimeEventBase):
    event_type: Literal["summary_updated"]
    change_domain: Literal["SUMMARY"]
    snapshot_required: Literal[False]
    payload: SummaryUpdatedPayload


class DeviceStateChangedEvent(RealtimeEventBase):
    event_type: Literal["device_state_changed"]
    change_domain: Literal["DEVICE_STATE"]
    snapshot_required: Literal[False]
    payload: DeviceStateChangedPayload


class MediaStateChangedEvent(RealtimeEventBase):
    event_type: Literal["media_state_changed"]
    change_domain: Literal["DEVICE_STATE"]
    snapshot_required: Literal[False]
    payload: DeviceStateChangedPayload


class HaSyncRecoveredEvent(RealtimeEventBase):
    event_type: Literal["ha_sync_recovered"]
    change_domain: Literal["SUMMARY"]
    snapshot_required: Literal[False]
    payload: ConnectionStatusPayload


class HaSyncDegradedEvent(RealtimeEventBase):
    event_type: Literal["ha_sync_degraded"]
    change_domain: Literal["SUMMARY"]
    snapshot_required: Literal[False]
    payload: ConnectionStatusPayload


class EnergyRefreshCompletedEvent(RealtimeEventBase):
    event_type: Literal["energy_refresh_completed"]
    change_domain: Literal["ENERGY"]
    snapshot_required: Literal[False]
    payload: EnergyRefreshPayload


class EnergyRefreshFailedEvent(RealtimeEventBase):
    event_type: Literal["energy_refresh_failed"]
    change_domain: Literal["ENERGY"]
    snapshot_required: Literal[False]
    payload: EnergyRefreshPayload


class DraftLockAcquiredEvent(RealtimeEventBase):
    event_type: Literal["draft_lock_acquired"]
    change_domain: Literal["EDITOR_LOCK"]
    snapshot_required: Literal[False]
    payload: DraftLockAcquiredPayload


class DraftLockLostEvent(RealtimeEventBase):
    event_type: Literal["draft_lock_lost"]
    change_domain: Literal["EDITOR_LOCK"]
    snapshot_required: Literal[False]
    payload: DraftLockLostPayload


class DraftTakenOverEvent(RealtimeEventBase):
    event_type: Literal["draft_taken_over"]
    change_domain: Literal["EDITOR_LOCK"]
    snapshot_required: Literal[False]
    payload: DraftTakenOverPayload


class PublishSucceededEvent(RealtimeEventBase):
    event_type: Literal["publish_succeeded"]
    change_domain: Literal["LAYOUT"]
    snapshot_required: Literal[True]
    payload: PublishSucceededPayload


class BackupRestoreCompletedEvent(RealtimeEventBase):
    event_type: Literal["backup_restore_completed"]
    change_domain: Literal["BACKUP"]
    snapshot_required: Literal[True]
    payload: BackupRestoreCompletedPayload


class VersionConflictDetectedEvent(RealtimeEventBase):
    event_type: Literal["version_conflict_detected"]
    change_domain: Literal["SUMMARY"]
    snapshot_required: Literal[True]
    payload: VersionConflictDetectedPayload


RealtimeServerEvent = Annotated[
    SettingsUpdatedEvent
    | SummaryUpdatedEvent
    | DeviceStateChangedEvent
    | MediaStateChangedEvent
    | HaSyncRecoveredEvent
    | HaSyncDegradedEvent
    | EnergyRefreshCompletedEvent
    | EnergyRefreshFailedEvent
    | DraftLockAcquiredEvent
    | DraftLockLostEvent
    | DraftTakenOverEvent
    | PublishSucceededEvent
    | BackupRestoreCompletedEvent
    | VersionConflictDetectedEvent,
    Field(discriminator="event_type"),
]


class RealtimeContractBundle(ApiSchema):
    server_event: RealtimeServerEvent
    client_message: RealtimeClientMessage


realtime_server_event_adapter = TypeAdapter(RealtimeServerEvent)
realtime_client_message_adapter = TypeAdapter(RealtimeClientMessage)

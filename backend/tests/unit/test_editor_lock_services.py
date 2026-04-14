from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from src.modules.editor.services.EditorDraftService import EditorDraftInput, EditorDraftService
from src.modules.editor.services.EditorSessionService import (
    HEARTBEAT_INTERVAL_SECONDS,
    LEASE_TTL_SECONDS,
    EditorSessionInput,
    EditorSessionService,
)
from src.repositories.query.editor.EditorLeaseQueryRepository import EditorLeaseContextReadModel
from src.repositories.read_models.index import DraftLeaseReadModel, EditorDraftReadModel


class _Clock:
    def now(self):
        return datetime(2026, 4, 14, 10, 0, 0, tzinfo=timezone.utc)


class _NoopPinGuard:
    async def require_active_session(self, *_args, **_kwargs):
        return None


class _NoopUnitOfWork:
    async def run_in_transaction(self, func):
        return await func(SimpleNamespace(session=None))


class _NoopDraftHotspotRepository:
    async def replace_for_draft_layout(self, *_args, **_kwargs):
        return None


class _NoopLayoutHotspotRepository:
    async def list_by_layout_version_id(self, *_args, **_kwargs):
        return []


class _NoopWsEventOutboxRepository:
    async def insert(self, *_args, **_kwargs):
        return None


class _IdGenerator:
    def next_id(self):
        return "lease-new"


class _VersionTokenGenerator:
    def next_draft_version(self):
        return "dv-new"


class _EventIdGenerator:
    def next_event_id(self):
        return "evt-1"


class _CurrentLayoutRepository:
    async def find_current_by_home(self, *_args, **_kwargs):
        return SimpleNamespace(
            id="layout-row-1",
            layout_version="lv-current",
            background_asset_id=None,
        )


@dataclass
class _InsertedLease:
    lease_id: str
    lease_expires_at: str


class _DraftLeaseRepository:
    def __init__(self):
        self.inserted = None
        self.deactivated: list[tuple[str, str, str | None]] = []

    async def find_by_lease_id(self, *_args, **_kwargs):
        return None

    async def insert(self, input, ctx=None):
        self.inserted = input
        return _InsertedLease(
            lease_id=input.lease_id,
            lease_expires_at=input.lease_expires_at,
        )

    async def deactivate_lease(self, lease_id, next_status, lost_reason, ctx=None):
        self.deactivated.append((lease_id, next_status, lost_reason))

    async def heartbeat(self, *_args, **_kwargs):
        return 1


class _DraftLayoutRepository:
    def __init__(self, draft):
        self._draft = draft

    async def find_by_home_id(self, *_args, **_kwargs):
        return self._draft

    async def upsert(self, *_args, **_kwargs):
        return self._draft


class _EditorLeaseQueryRepository:
    def __init__(self, active_lease, derived_lock_status="GRANTED"):
        self._active_lease = active_lease
        self._derived_lock_status = derived_lock_status

    async def get_lease_context(self, *_args, **_kwargs):
        return EditorLeaseContextReadModel(
            active_lease=self._active_lease,
            derived_lock_status=self._derived_lock_status,
        )


class _EditorDraftQueryRepository:
    def __init__(self, draft):
        self._draft = draft

    async def get_draft_context(self, *_args, **_kwargs):
        return self._draft


def _build_draft_service(draft):
    return EditorDraftService(
        unit_of_work=_NoopUnitOfWork(),
        editor_draft_query_repository=_EditorDraftQueryRepository(draft),
        draft_layout_repository=SimpleNamespace(),
        draft_hotspot_repository=SimpleNamespace(),
        draft_lease_repository=SimpleNamespace(),
        management_pin_guard=_NoopPinGuard(),
        version_token_generator=_VersionTokenGenerator(),
        clock=_Clock(),
    )


def _build_session_service(active_lease):
    draft_repo = _DraftLeaseRepository()
    draft_layout = _DraftLayoutRepository(
        SimpleNamespace(
            draft_version="dv-1",
            base_layout_version="lv-current",
            id="draft-1",
        )
    )
    service = EditorSessionService(
        unit_of_work=_NoopUnitOfWork(),
        editor_lease_query_repository=_EditorLeaseQueryRepository(active_lease),
        draft_lease_repository=draft_repo,
        draft_layout_repository=draft_layout,
        draft_hotspot_repository=_NoopDraftHotspotRepository(),
        layout_version_repository=_CurrentLayoutRepository(),
        layout_hotspot_repository=_NoopLayoutHotspotRepository(),
        ws_event_outbox_repository=_NoopWsEventOutboxRepository(),
        management_pin_guard=_NoopPinGuard(),
        id_generator=_IdGenerator(),
        version_token_generator=_VersionTokenGenerator(),
        event_id_generator=_EventIdGenerator(),
        clock=_Clock(),
    )
    return service, draft_repo


@pytest.mark.asyncio
async def test_get_draft_distinguishes_granted_locked_and_read_only():
    active_lease = DraftLeaseReadModel(
        lease_id="lease-1",
        terminal_id="terminal-1",
        member_id=None,
        lease_status="ACTIVE",
        is_active=True,
        lease_expires_at="2026-04-14T10:01:00+00:00",
        last_heartbeat_at="2026-04-14T09:59:40+00:00",
    )
    draft = EditorDraftReadModel(
        draft_id="draft-1",
        home_id="home-1",
        draft_version="dv-1",
        base_layout_version="lv-1",
        background_asset_id=None,
        layout_meta={"density": "comfortable"},
        hotspots=[],
        active_lease=active_lease,
    )
    service = _build_draft_service(draft)

    granted = await service.get_draft(
        EditorDraftInput(home_id="home-1", terminal_id="terminal-1", lease_id="lease-1")
    )
    readonly_same_terminal = await service.get_draft(
        EditorDraftInput(home_id="home-1", terminal_id="terminal-1", lease_id=None)
    )
    locked_by_other = await service.get_draft(
        EditorDraftInput(home_id="home-1", terminal_id="terminal-2", lease_id=None)
    )

    assert granted.lock_status == "GRANTED"
    assert granted.readonly is False
    assert readonly_same_terminal.lock_status == "READ_ONLY"
    assert readonly_same_terminal.readonly is True
    assert locked_by_other.lock_status == "LOCKED_BY_OTHER"
    assert locked_by_other.readonly is True


@pytest.mark.asyncio
async def test_open_session_reuses_valid_lease_with_20_second_heartbeat():
    active_lease = DraftLeaseReadModel(
        lease_id="lease-1",
        terminal_id="terminal-1",
        member_id=None,
        lease_status="ACTIVE",
        is_active=True,
        lease_expires_at="2026-04-14T10:01:00+00:00",
        last_heartbeat_at="2026-04-14T09:59:40+00:00",
    )
    service, _draft_repo = _build_session_service(active_lease)

    view = await service.open_session(
        EditorSessionInput(home_id="home-1", terminal_id="terminal-1")
    )

    assert view.granted is True
    assert view.lease_id == "lease-1"
    assert view.heartbeat_interval_seconds == HEARTBEAT_INTERVAL_SECONDS
    assert view.locked_by is None


@pytest.mark.asyncio
async def test_open_session_replaces_expired_lease_with_60_second_ttl():
    expired_lease = DraftLeaseReadModel(
        lease_id="lease-old",
        terminal_id="terminal-2",
        member_id=None,
        lease_status="ACTIVE",
        is_active=True,
        lease_expires_at="2026-04-14T09:59:00+00:00",
        last_heartbeat_at="2026-04-14T09:58:40+00:00",
    )
    service, draft_repo = _build_session_service(expired_lease)

    view = await service.open_session(
        EditorSessionInput(home_id="home-1", terminal_id="terminal-1")
    )

    assert draft_repo.deactivated == [("lease-old", "TAKEN_OVER", "TAKEN_OVER")]
    assert draft_repo.inserted is not None
    assert draft_repo.inserted.heartbeat_interval_seconds == HEARTBEAT_INTERVAL_SECONDS
    assert draft_repo.inserted.lease_expires_at == "2026-04-14T10:01:00+00:00"
    assert view.lease_id == "lease-new"
    assert view.lease_expires_at == "2026-04-14T10:01:00+00:00"
    assert LEASE_TTL_SECONDS == 60

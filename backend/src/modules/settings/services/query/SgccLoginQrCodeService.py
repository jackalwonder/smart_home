from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from src.infrastructure.ha.HaConnectionGateway import HaConnectionGateway
from src.modules.settings.services.query.SgccLoginQrCodeModels import (
    ENERGY_PROVIDER,
    PNG_SIGNATURE,
    SgccAutoBindingResult,
    SgccCachedAccount,
    SgccLoginQrCodeFileView,
    SgccLoginQrCodeStatusView,
    accounts_from_runtime_status,
    decode_energy_payload,
    discover_entity_map,
    entity_ids_for_suffix,
    has_complete_entity_map,
    latest_account_timestamp,
    mask_account_id,
    phase_from_qrcode_status,
    phase_from_runtime_status,
    read_cached_accounts,
    runtime_phase_message,
    runtime_status_view,
    sgcc_sensor_suffix,
)
from src.modules.settings.services.query.SgccRuntimeControlService import (
    DockerUnixSocketContainerRestarter,
    SgccContainerRestarter,
    SgccQrCodeImage,
    SgccRuntimeStatus,
)
from src.repositories.base.energy.EnergyAccountRepository import (
    EnergyAccountRepository,
    EnergyAccountUpsertRow,
)
from src.shared.config.Settings import Settings
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode


class SgccLoginQrCodeService:
    def __init__(
        self,
        settings: Settings,
        energy_account_repository: EnergyAccountRepository | None = None,
        ha_connection_gateway: HaConnectionGateway | None = None,
        runtime_control: SgccContainerRestarter | None = None,
    ) -> None:
        self._qr_code_file = Path(settings.sgcc_qr_code_file)
        self._cache_file = Path(settings.sgcc_cache_file)
        self._qr_code_ttl_seconds = settings.sgcc_qr_code_ttl_seconds
        self._fetch_wait_timeout_seconds = max(10, settings.energy_upstream_wait_timeout_seconds + 15)
        self._fetch_poll_interval_seconds = max(1.0, settings.energy_upstream_poll_interval_seconds)
        self._energy_account_repository = energy_account_repository
        self._ha_connection_gateway = ha_connection_gateway
        self._runtime_control = runtime_control or DockerUnixSocketContainerRestarter(
            settings.sgcc_docker_socket_path,
            settings.sgcc_docker_container_name,
        )

    def _build_pending_status(self, message: str) -> SgccLoginQrCodeStatusView:
        return SgccLoginQrCodeStatusView(
            available=False,
            status="PENDING",
            phase="WAITING_FOR_QR_CODE",
            qr_code_status=None,
            job_state=None,
            job_kind=None,
            job_phase=None,
            last_error=None,
            account_count=0,
            latest_account_timestamp=None,
            image_url=None,
            updated_at=None,
            expires_at=None,
            age_seconds=None,
            file_size_bytes=None,
            mime_type=None,
            message=message,
        )

    def _build_bound_status(
        self,
        binding: SgccAutoBindingResult,
        runtime_status: SgccRuntimeStatus | None = None,
    ) -> SgccLoginQrCodeStatusView:
        file_path = self._cache_file
        stat = file_path.stat() if file_path.exists() and file_path.is_file() else None
        if stat is None:
            updated_at = binding.timestamp or None
            age_seconds = None
            file_size_bytes = None
        else:
            updated_at_datetime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            updated_at = updated_at_datetime.isoformat()
            age_seconds = max(0, int((datetime.now(timezone.utc) - updated_at_datetime).total_seconds()))
            file_size_bytes = stat.st_size
        action = "saved" if binding.changed else "already saved"
        return SgccLoginQrCodeStatusView(
            available=False,
            status="BOUND",
            phase="BOUND",
            qr_code_status=None,
            job_state=runtime_status.job_state if runtime_status else None,
            job_kind=runtime_status.job_kind if runtime_status else None,
            job_phase=runtime_status.job_phase if runtime_status else None,
            last_error=runtime_status.last_error if runtime_status else None,
            account_count=1,
            latest_account_timestamp=binding.timestamp or None,
            image_url=None,
            updated_at=updated_at,
            expires_at=None,
            age_seconds=age_seconds,
            file_size_bytes=file_size_bytes,
            mime_type="application/json" if stat is not None else None,
            message=(
                f"SGCC login data detected and energy binding was {action} "
                f"for account {mask_account_id(binding.account_id)}."
            ),
        )

    def _build_file_status(
        self,
        *,
        file_path: Path,
        available: bool,
        status: str,
        image_url: str | None,
        mime_type: str | None,
        message: str,
    ) -> SgccLoginQrCodeStatusView:
        stat = file_path.stat()
        updated_at_datetime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        now = datetime.now(timezone.utc)
        age_seconds = max(0, int((now - updated_at_datetime).total_seconds()))
        expires_at_datetime = updated_at_datetime.timestamp() + self._qr_code_ttl_seconds
        return SgccLoginQrCodeStatusView(
            available=available,
            status=status,
            phase=phase_from_qrcode_status(status),
            qr_code_status=status,
            job_state=None,
            job_kind=None,
            job_phase=None,
            last_error=None,
            account_count=0,
            latest_account_timestamp=None,
            image_url=image_url,
            updated_at=updated_at_datetime.isoformat(),
            expires_at=datetime.fromtimestamp(
                expires_at_datetime,
                tz=timezone.utc,
            ).isoformat(),
            age_seconds=age_seconds,
            file_size_bytes=stat.st_size,
            mime_type=mime_type,
            message=message,
        )

    async def get_status(
        self,
        home_id: str | None = None,
        terminal_id: str | None = None,
        member_id: str | None = None,
    ) -> SgccLoginQrCodeStatusView:
        del home_id, terminal_id, member_id
        runtime_status = await self._get_runtime_status()
        if runtime_status is not None:
            qrcode = runtime_status.qrcode
            if qrcode is None:
                return runtime_status_view(
                    runtime_status,
                    available=False,
                    status="PENDING",
                    phase=phase_from_runtime_status(runtime_status, None),
                    image_url=None,
                    message=runtime_status.message or "Waiting for SGCC sidecar status.",
                )
            phase = phase_from_runtime_status(runtime_status, qrcode)
            if not qrcode.available:
                return SgccLoginQrCodeStatusView(
                    available=False,
                    status=phase,
                    phase=phase,
                    qr_code_status=qrcode.status,
                    job_state=runtime_status.job_state,
                    job_kind=runtime_status.job_kind,
                    job_phase=runtime_status.job_phase,
                    last_error=runtime_status.last_error,
                    account_count=len(runtime_status.accounts),
                    latest_account_timestamp=latest_account_timestamp(runtime_status.accounts),
                    image_url=None,
                    updated_at=qrcode.updated_at,
                    expires_at=qrcode.expires_at,
                    age_seconds=qrcode.age_seconds,
                    file_size_bytes=qrcode.file_size_bytes,
                    mime_type=qrcode.mime_type,
                    message=runtime_phase_message(
                        phase,
                        runtime_status,
                        qrcode.message or runtime_status.message,
                    ),
                )
            version = qrcode.updated_at or qrcode.file_size_bytes or "ready"
            return SgccLoginQrCodeStatusView(
                available=True,
                status=phase,
                phase=phase,
                qr_code_status=qrcode.status,
                job_state=runtime_status.job_state,
                job_kind=runtime_status.job_kind,
                job_phase=runtime_status.job_phase,
                last_error=runtime_status.last_error,
                account_count=len(runtime_status.accounts),
                latest_account_timestamp=latest_account_timestamp(runtime_status.accounts),
                image_url=f"/api/v1/settings/sgcc-login-qrcode/file?v={version}",
                updated_at=qrcode.updated_at,
                expires_at=qrcode.expires_at,
                age_seconds=qrcode.age_seconds,
                file_size_bytes=qrcode.file_size_bytes,
                mime_type=qrcode.mime_type or "image/png",
                message=runtime_phase_message(
                    phase,
                    runtime_status,
                    qrcode.message
                    or "QR code is ready. Scan it with the State Grid app to finish login.",
                ),
            )

        file_path = self._qr_code_file
        if not file_path.exists() or not file_path.is_file():
            return self._build_pending_status(
                (
                    "Waiting for sgcc_electricity to generate a login QR code. "
                    "If it does not appear, check whether the container has switched to QR login."
                ),
            )

        signature = file_path.read_bytes()[: len(PNG_SIGNATURE)]
        if signature != PNG_SIGNATURE:
            return self._build_file_status(
                file_path=file_path,
                available=False,
                status="PENDING",
                image_url=None,
                mime_type=None,
                message=(
                    "The current sgcc_electricity QR file is not a ready PNG yet. "
                    "Please wait for the next QR login attempt."
                ),
            )

        stat = file_path.stat()
        updated_at = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        age_seconds = (datetime.now(timezone.utc) - updated_at).total_seconds()
        if age_seconds > self._qr_code_ttl_seconds:
            return self._build_file_status(
                file_path=file_path,
                available=False,
                status="EXPIRED",
                image_url=None,
                mime_type="image/png",
                message="The current QR code has expired. Generate a new QR code before scanning.",
            )

        return self._build_file_status(
            file_path=file_path,
            available=True,
            status="READY",
            image_url=f"/api/v1/settings/sgcc-login-qrcode/file?v={stat.st_mtime_ns}",
            mime_type="image/png",
            message="QR code is ready. Scan it with the State Grid app to finish login.",
        )

    async def bind_energy_account(
        self,
        *,
        home_id: str,
        terminal_id: str | None = None,
        member_id: str | None = None,
    ) -> SgccLoginQrCodeStatusView:
        runtime_status = await self._get_runtime_status()
        binding = await self._try_auto_bind_energy_account(
            home_id=home_id,
            terminal_id=terminal_id,
            member_id=member_id,
            accounts=accounts_from_runtime_status(runtime_status),
        )
        if binding is None:
            return self._build_pending_status(
                "SGCC account data is not ready. Scan the QR code first and wait for Home Assistant SGCC sensors to appear."
            )
        return self._build_bound_status(binding, runtime_status)

    async def pull_energy_data(
        self,
        *,
        home_id: str,
        terminal_id: str | None = None,
        member_id: str | None = None,
    ) -> SgccLoginQrCodeStatusView:
        await self._runtime_control.fetch()
        runtime_status = await self._wait_for_fetch_completion()
        if runtime_status is None:
            raise AppError(
                ErrorCode.INTERNAL_SERVER_ERROR,
                "SGCC sidecar did not return fetch status.",
            )
        last_error = (runtime_status.last_error or "").upper()
        if (runtime_status.job_state or "").upper() == "FAILED" or last_error:
            if last_error == "LOGIN_REQUIRED":
                raise AppError(
                    ErrorCode.INTERNAL_SERVER_ERROR,
                    "登录态失效，请重新扫码。",
                    details={"reason": "LOGIN_REQUIRED"},
                )
            raise AppError(
                ErrorCode.INTERNAL_SERVER_ERROR,
                "SGCC fetch failed.",
                details={"reason": runtime_status.last_error or runtime_status.job_phase or "UNKNOWN"},
            )

        binding = await self._try_auto_bind_energy_account(
            home_id=home_id,
            terminal_id=terminal_id,
            member_id=member_id,
            accounts=accounts_from_runtime_status(runtime_status),
        )
        if binding is not None:
            return self._build_bound_status(binding, runtime_status)
        return await self.get_status(home_id=home_id, terminal_id=terminal_id, member_id=member_id)

    async def get_file(self) -> SgccLoginQrCodeFileView:
        image = await self._get_runtime_qrcode()
        if image is not None:
            return SgccLoginQrCodeFileView(
                path=None,
                mime_type=image.mime_type,
                content=image.content,
            )

        status = await self.get_status()
        if not status.available:
            raise AppError(
                ErrorCode.NOT_FOUND,
                "sgcc login QR code is not ready",
                details={"status": status.status},
            )

        return SgccLoginQrCodeFileView(
            path=str(self._qr_code_file),
            mime_type="image/png",
        )

    async def regenerate(self) -> SgccLoginQrCodeStatusView:
        file_path = self._qr_code_file
        if file_path.exists() and file_path.is_file():
            file_path.unlink()
        await self._runtime_control.restart()
        return self._build_pending_status(
            "Regenerating the SGCC login QR code. This may take a few minutes while sgcc_electricity retries password login and switches to QR mode."
        )

    async def _wait_for_fetch_completion(self) -> SgccRuntimeStatus | None:
        deadline = asyncio.get_running_loop().time() + self._fetch_wait_timeout_seconds
        last_status: SgccRuntimeStatus | None = None
        while True:
            last_status = await self._get_runtime_status()
            if last_status is not None:
                job_kind = (last_status.job_kind or "").upper()
                job_state = (last_status.job_state or last_status.state or "").upper()
                if job_kind == "FETCH" and job_state in {"COMPLETED", "FAILED"}:
                    return last_status
                if job_state == "FAILED":
                    return last_status
            if asyncio.get_running_loop().time() >= deadline:
                raise AppError(
                    ErrorCode.INTERNAL_SERVER_ERROR,
                    "服务端网关等待超时，能耗同步可能仍在后台执行，请稍后刷新状态。",
                    details={"reason": "FETCH_WAIT_TIMEOUT"},
                )
            await asyncio.sleep(self._fetch_poll_interval_seconds)

    async def _try_auto_bind_energy_account(
        self,
        *,
        home_id: str | None,
        terminal_id: str | None,
        member_id: str | None,
        accounts: list[SgccCachedAccount] | None = None,
    ) -> SgccAutoBindingResult | None:
        if not home_id or self._energy_account_repository is None:
            return None

        accounts = accounts if accounts is not None else await asyncio.to_thread(read_cached_accounts, self._cache_file)
        if not accounts:
            return None

        account = accounts[0]
        entity_map = await self._resolve_entity_map(home_id, account.account_id)
        if not has_complete_entity_map(entity_map):
            return None

        existing = await self._energy_account_repository.find_by_home_id(home_id)
        existing_payload = decode_energy_payload(existing.account_payload_encrypted if existing else None)
        if (
            existing is not None
            and existing.binding_status == "BOUND"
            and existing_payload.get("account_id") == account.account_id
            and existing_payload.get("entity_map") == entity_map
        ):
            return SgccAutoBindingResult(
                account_id=account.account_id,
                entity_map=entity_map,
                changed=False,
                timestamp=account.timestamp,
            )

        await self._energy_account_repository.upsert(
            EnergyAccountUpsertRow(
                home_id=home_id,
                binding_status="BOUND",
                account_payload_encrypted=json.dumps(
                    {
                        "provider": ENERGY_PROVIDER,
                        "account_id": account.account_id,
                        "account_suffix": account.account_id,
                        "entity_map": entity_map,
                    },
                    ensure_ascii=True,
                ),
                updated_by_member_id=member_id,
                updated_by_terminal_id=terminal_id,
            )
        )
        return SgccAutoBindingResult(
            account_id=account.account_id,
            entity_map=entity_map,
            changed=True,
            timestamp=account.timestamp,
        )

    async def _resolve_entity_map(self, home_id: str, account_id: str) -> dict[str, str]:
        suffix = sgcc_sensor_suffix(account_id)
        if self._ha_connection_gateway is not None:
            try:
                states = await self._ha_connection_gateway.fetch_states(home_id)
            except Exception:
                states = None
            entity_map = discover_entity_map(states or [], suffix)
            if has_complete_entity_map(entity_map):
                return entity_map

        if suffix:
            return entity_ids_for_suffix(suffix)
        return {}

    async def _get_runtime_status(self) -> SgccRuntimeStatus | None:
        try:
            return await self._runtime_control.get_status()
        except Exception:
            return None

    async def _get_runtime_qrcode(self) -> SgccQrCodeImage | None:
        try:
            return await self._runtime_control.get_qrcode()
        except Exception:
            return None

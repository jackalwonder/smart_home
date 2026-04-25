import { FormEvent, useMemo, useState } from "react";
import {
  fetchCurrentSession,
  fetchPinSessionStatus,
  verifyManagementPin,
} from "../../api/authApi";
import { normalizeApiError } from "../../api/httpClient";
import { appStore, useAppStore } from "../../store/useAppStore";
import { syncRealtimeSession } from "../../system/realtime";

function formatRemainingLock(seconds: number) {
  if (seconds <= 0) {
    return "可用";
  }

  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}分 ${remainSeconds}秒`;
}

export function PinAccessCard() {
  const session = useAppStore((state) => state.session);
  const pin = useAppStore((state) => state.pin);
  const [pinValue, setPinValue] = useState("");
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const disabled = useMemo(
    () =>
      session.status !== "success" ||
      !session.data?.homeId ||
      !session.data?.terminalId ||
      pin.status === "loading",
    [pin.status, session.data?.homeId, session.data?.terminalId, session.status],
  );

  async function refreshPinState() {
    try {
      appStore.setPinLoading();
      const pinStatus = await fetchPinSessionStatus();
      appStore.setPinState({
        active: pinStatus.pin_session_active,
        expiresAt: pinStatus.pin_session_expires_at,
        remainingLockSeconds: pinStatus.remaining_lock_seconds,
      });
    } catch (error) {
      appStore.setPinError(normalizeApiError(error).message);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session.data?.homeId || !session.data?.terminalId || !pinValue.trim()) {
      return;
    }

    setLocalMessage(null);
    appStore.setPinLoading();

    try {
      const response = await verifyManagementPin({
        home_id: session.data.homeId,
        terminal_id: session.data.terminalId,
        pin: pinValue.trim(),
        target_action: "MANAGEMENT",
      });

      const currentSession = await fetchCurrentSession();
      appStore.setSessionData(currentSession);
      appStore.setPinState({
        active: response.pin_session_active,
        expiresAt: response.pin_session_expires_at,
        remainingLockSeconds: 0,
      });
      syncRealtimeSession(currentSession);
      setPinValue("");
      setLocalMessage("PIN 验证通过，管理操作现已可用。");
    } catch (error) {
      const apiError = normalizeApiError(error);
      appStore.setPinError(apiError.message);
      const pinStatus = await fetchPinSessionStatus().catch(() => null);
      if (pinStatus) {
        appStore.setPinState({
          active: pinStatus.pin_session_active,
          expiresAt: pinStatus.pin_session_expires_at,
          remainingLockSeconds: pinStatus.remaining_lock_seconds,
        });
      }
    }
  }

  return (
    <section className="utility-card pin-card">
      <div className="pin-card__header">
        <div>
          <span className="card-eyebrow">安全</span>
          <h3>管理 PIN</h3>
          <p className="muted-copy">编辑设置、草稿和系统连接前，需要先验证管理 PIN。</p>
        </div>
        <button
          className="button button--ghost"
          onClick={() => void refreshPinState()}
          type="button"
        >
          刷新状态
        </button>
      </div>

      <dl className="pin-card__meta">
        <div>
          <dt>状态</dt>
          <dd>{pin.active ? "已验证" : "待验证"}</dd>
        </div>
        <div>
          <dt>锁定</dt>
          <dd>{formatRemainingLock(pin.remainingLockSeconds)}</dd>
        </div>
        <div>
          <dt>过期时间</dt>
          <dd>{pin.expiresAt ?? "-"}</dd>
        </div>
      </dl>

      {pin.active ? (
        <p className="pin-card__success">
          当前管理会话已生效，设置页和编辑器都会复用这次验证结果。
        </p>
      ) : (
        <form className="pin-card__form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="pin-card__field">
            <span>PIN</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setPinValue(event.target.value)}
              placeholder="输入管理 PIN"
              type="password"
              value={pinValue}
            />
          </label>
          <button className="button button--primary" disabled={disabled} type="submit">
            {pin.status === "loading" ? "验证中..." : "验证 PIN"}
          </button>
        </form>
      )}

      {localMessage ? <p className="pin-card__success">{localMessage}</p> : null}
      {pin.error ? <p className="inline-error">{pin.error}</p> : null}
      <p className="muted-copy">当前 Docker 开发环境的默认 PIN：`1234`。</p>
    </section>
  );
}

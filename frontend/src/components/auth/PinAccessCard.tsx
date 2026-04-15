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
    return "Ready";
  }

  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}m ${remainSeconds}s`;
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
      setLocalMessage("PIN verified. Management actions are now enabled.");
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
    <section className="app-shell__status-card pin-card">
      <div className="pin-card__header">
        <div>
          <h2>Management PIN</h2>
          <p className="page__hint">Verify before editing settings, draft, or system actions.</p>
        </div>
        <button className="button-link" onClick={() => void refreshPinState()} type="button">
          Refresh
        </button>
      </div>

      <dl className="pin-card__meta">
        <div>
          <dt>Status</dt>
          <dd>{pin.active ? "Verified" : "Pending"}</dd>
        </div>
        <div>
          <dt>Lock</dt>
          <dd>{formatRemainingLock(pin.remainingLockSeconds)}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>{pin.expiresAt ?? "-"}</dd>
        </div>
      </dl>

      {pin.active ? (
        <p className="pin-card__success">
          Management session is active. Settings and editor requests will use the current cookie.
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
              placeholder="Enter management PIN"
              type="password"
              value={pinValue}
            />
          </label>
          <button className="tab-bar__item is-active" disabled={disabled} type="submit">
            {pin.status === "loading" ? "Verifying..." : "Verify PIN"}
          </button>
        </form>
      )}

      {localMessage ? <p className="pin-card__success">{localMessage}</p> : null}
      {pin.error ? <p className="page__error">{pin.error}</p> : null}
      <p className="page__hint">Dev seed PIN in this Docker environment: `1234`.</p>
    </section>
  );
}

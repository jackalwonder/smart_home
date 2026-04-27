import { useEffect } from "react";
import { heartbeatEditorSession } from "../../api/editorApi";
import { normalizeApiError } from "../../api/httpClient";
import { isConflictErrorCode } from "./homeStageEditorModel";
import type { LightEditorSessionState } from "./homeStageEditorModel";
import type { EditorNoticeState } from "./homeStageEditorModel";

interface UseEditorSessionHeartbeatOptions {
  leaseId: string | null;
  lockStatus: string | null;
  heartbeatIntervalSeconds: number | null;
  onHeartbeatSuccess: (nextState: Partial<LightEditorSessionState>) => void;
  onHeartbeatError: (notice: EditorNoticeState) => void;
}

export function useEditorSessionHeartbeat({
  leaseId,
  lockStatus,
  heartbeatIntervalSeconds,
  onHeartbeatSuccess,
  onHeartbeatError,
}: UseEditorSessionHeartbeatOptions) {
  useEffect(() => {
    if (lockStatus !== "GRANTED" || !leaseId) {
      return;
    }

    const intervalSeconds = heartbeatIntervalSeconds ?? 20;
    const heartbeatDelayMs = Math.max(5000, Math.floor(intervalSeconds * 750));
    let active = true;

    const timer = window.setInterval(() => {
      if (!leaseId) {
        return;
      }

      void (async () => {
        try {
          const heartbeat = await heartbeatEditorSession(leaseId);
          if (!active) {
            return;
          }
          onHeartbeatSuccess({
            leaseId: heartbeat.lease_id,
            leaseExpiresAt: heartbeat.lease_expires_at ?? null,
            lockStatus: heartbeat.lock_status,
          });
        } catch (error) {
          if (!active) {
            return;
          }
          const apiError = normalizeApiError(error);
          onHeartbeatError({
            tone: "warning",
            title: "首页轻编辑已中断",
            detail: isConflictErrorCode(apiError.code)
              ? "当前草稿锁状态已变化，请前往首页高级设置继续处理。"
              : apiError.message,
          });
        }
      })();
    }, heartbeatDelayMs);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [heartbeatIntervalSeconds, leaseId, lockStatus, onHeartbeatSuccess, onHeartbeatError]);
}

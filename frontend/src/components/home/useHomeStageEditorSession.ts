import { useEffect, useCallback, useState } from "react";
import {
  createEditorSession,
  fetchEditorDraft,
  publishEditorDraft,
} from "../../api/editorApi";
import { normalizeApiError } from "../../api/httpClient";
import {
  areEditorDraftStatesEqual,
  type EditorDraftState,
} from "../../editor/editorDraftState";
import { appStore } from "../../store/useAppStore";
import {
  draftResponseToStageState,
  type EditorNoticeState,
  type LightEditorSessionState,
} from "./homeStageEditorModel";
import { useEditorSessionHeartbeat } from "./useEditorSessionHeartbeat";
import { persistDraft as persistDraftUtil } from "./homeStageEditorPersistence";

interface UseHomeStageEditorSessionOptions {
  onApplied: () => Promise<void> | void;
  onExit: () => void;
  onOpenAdvancedSettings: () => void;
  pinActive: boolean;
}

const EMPTY_DRAFT_STATE: EditorDraftState = {
  backgroundAssetId: null,
  backgroundImageUrl: null,
  backgroundImageSize: null,
  layoutMetaText: "{}",
  hotspots: [],
};

const EMPTY_SESSION_STATE: LightEditorSessionState = {
  leaseId: null,
  draftVersion: null,
  baseLayoutVersion: null,
  leaseExpiresAt: null,
  heartbeatIntervalSeconds: null,
  lockStatus: null,
};

export function useHomeStageEditorSession({
  onApplied,
  onExit,
  onOpenAdvancedSettings,
  pinActive,
}: UseHomeStageEditorSessionOptions) {
  const [editorSession, setEditorSession] =
    useState<LightEditorSessionState>(EMPTY_SESSION_STATE);
  const [draftState, setDraftState] = useState<EditorDraftState>(EMPTY_DRAFT_STATE);
  const [baselineDraft, setBaselineDraft] = useState<EditorDraftState | null>(null);
  const [draftResetKey, setDraftResetKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [notice, setNotice] = useState<EditorNoticeState | null>(null);

  const canEdit = pinActive && editorSession.lockStatus === "GRANTED";
  const hasUnsavedChanges = baselineDraft
    ? !areEditorDraftStatesEqual(draftState, baselineDraft)
    : false;

  function applySessionState(nextState: Partial<LightEditorSessionState>) {
    setEditorSession((current) => {
      const merged = { ...current, ...nextState };
      appStore.setEditorSession({
        lockStatus: merged.lockStatus,
        leaseId: merged.leaseId,
        leaseExpiresAt: merged.leaseExpiresAt,
        heartbeatIntervalSeconds: merged.heartbeatIntervalSeconds,
        lockedByTerminalId: null,
      });
      return merged;
    });
  }

  function applyDraftResponse(
    draft: Awaited<ReturnType<typeof fetchEditorDraft>>,
    nextSession?: Partial<LightEditorSessionState>,
  ) {
    const mergedSession = {
      ...editorSession,
      ...nextSession,
      draftVersion: draft.draft_version,
      baseLayoutVersion: draft.base_layout_version,
      lockStatus: draft.lock_status,
    };

    appStore.setEditorDraftData({
      draft: draft.layout ?? null,
      draftVersion: draft.draft_version,
      baseLayoutVersion: draft.base_layout_version,
      readonly: draft.readonly,
      lockStatus: draft.lock_status,
    });

    const nextDraftState = draftResponseToStageState(draft, mergedSession, pinActive);

    setDraftState(nextDraftState);
    setBaselineDraft(nextDraftState);
    setDraftResetKey((current) => current + 1);
    setNotice(null);
    applySessionState({
      draftVersion: draft.draft_version,
      baseLayoutVersion: draft.base_layout_version,
      lockStatus: draft.lock_status,
      ...nextSession,
    });
  }

  async function openLightEditorSession() {
    setIsLoading(true);
    setNotice(null);

    try {
      const lease = await createEditorSession();
      applySessionState({
        leaseId: lease.lease_id ?? null,
        leaseExpiresAt: lease.lease_expires_at ?? null,
        heartbeatIntervalSeconds: lease.heartbeat_interval_seconds ?? 20,
        lockStatus: lease.lock_status,
      });

      if (lease.lock_status !== "GRANTED" || !lease.lease_id) {
        setNotice({
          tone: "warning",
          title: "首页轻编辑当前不可用",
          detail: "当前编辑锁未授予本终端，请前往首页高级设置处理草稿锁和发布治理。",
        });
        return;
      }

      const draft = await fetchEditorDraft(lease.lease_id);
      applyDraftResponse(draft, {
        leaseId: lease.lease_id,
        leaseExpiresAt: lease.lease_expires_at ?? null,
        heartbeatIntervalSeconds: lease.heartbeat_interval_seconds ?? 20,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        title: "无法进入首页轻编辑",
        detail: normalizeApiError(error).message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!pinActive) {
      setIsLoading(false);
      setNotice({
        tone: "warning",
        title: "需要管理 PIN",
        detail: "请先在设置页验证管理 PIN，再进入总览轻编辑。",
      });
      return;
    }

    void openLightEditorSession();
  }, [pinActive]);

  const handleHeartbeatSuccess = useCallback(
    (nextState: Partial<LightEditorSessionState>) => {
      applySessionState(nextState);
    },
    [],
  );

  const handleHeartbeatError = useCallback(
    (errorNotice: EditorNoticeState) => {
      setNotice(errorNotice);
      applySessionState({
        lockStatus: "READ_ONLY",
        leaseId: null,
        leaseExpiresAt: null,
      });
    },
    [],
  );

  useEditorSessionHeartbeat({
    leaseId: editorSession.leaseId,
    lockStatus: editorSession.lockStatus,
    heartbeatIntervalSeconds: editorSession.heartbeatIntervalSeconds,
    onHeartbeatSuccess: handleHeartbeatSuccess,
    onHeartbeatError: handleHeartbeatError,
  });

  async function persistDraft() {
    if (
      !editorSession.leaseId ||
      !editorSession.draftVersion ||
      !editorSession.baseLayoutVersion ||
      !canEdit
    ) {
      return null;
    }

    return persistDraftUtil(
      {
        leaseId: editorSession.leaseId,
        draftVersion: editorSession.draftVersion,
        baseLayoutVersion: editorSession.baseLayoutVersion,
        draftState,
        leaseExpiresAt: editorSession.leaseExpiresAt,
        heartbeatIntervalSeconds: editorSession.heartbeatIntervalSeconds,
      },
      {
        onDraftRefreshed: (refreshed) => {
          applyDraftResponse(refreshed, {
            leaseId: editorSession.leaseId,
            leaseExpiresAt: editorSession.leaseExpiresAt,
            heartbeatIntervalSeconds: editorSession.heartbeatIntervalSeconds,
          });
        },
        onError: setNotice,
      },
    );
  }

  async function handleApplyChanges() {
    if (!canEdit || !editorSession.leaseId) {
      return;
    }

    setIsApplying(true);
    setNotice(null);
    try {
      const refreshed = await persistDraft();
      if (!refreshed?.draft_version || !refreshed.base_layout_version) {
        return;
      }

      await publishEditorDraft({
        lease_id: editorSession.leaseId,
        draft_version: refreshed.draft_version,
        base_layout_version: refreshed.base_layout_version,
      });

      await onApplied();
      setNotice({
        tone: "success",
        title: "首页更改已应用",
        detail: "当前轻编辑内容已经发布到首页。",
      });
      onExit();
    } catch (error) {
      const apiError = normalizeApiError(error);
      setNotice({
        tone: isConflictErrorCode(apiError.code) ? "warning" : "error",
        title: isConflictErrorCode(apiError.code)
          ? "请前往首页高级设置继续处理"
          : "应用首页更改失败",
        detail: isConflictErrorCode(apiError.code)
          ? "当前草稿锁或版本已变化，请改到首页高级设置完成后续发布。"
          : apiError.message,
      });
    } finally {
      setIsApplying(false);
    }
  }

  async function saveBeforeAction(action: () => void) {
    if (canEdit && hasUnsavedChanges) {
      setIsSaving(true);
      const saved = await persistDraft();
      setIsSaving(false);
      if (!saved) return;
    }
    action();
  }

  return {
    baselineDraft,
    canEdit,
    draftResetKey,
    draftState,
    editorSession,
    handleApplyChanges,
    handleExitEditor: () => saveBeforeAction(onExit),
    handleOpenAdvancedSettings: () => saveBeforeAction(onOpenAdvancedSettings),
    hasUnsavedChanges,
    isApplying,
    isLoading,
    isSaving,
    notice,
    persistDraft,
    setDraftState,
  };
}

import {
  fetchEditorDraft,
  saveEditorDraft,
} from "../../api/editorApi";
import { normalizeApiError } from "../../api/httpClient";
import {
  buildDraftHotspotInputs,
  buildLayoutMetaWithHotspotLabels,
  parseLayoutMetaText,
  type EditorDraftState,
} from "../../editor/editorDraftState";
import { isConflictErrorCode } from "./homeStageEditorModel";
import type { EditorNoticeState } from "./homeStageEditorModel";

interface PersistDraftInput {
  leaseId: string;
  draftVersion: string;
  baseLayoutVersion: string;
  draftState: EditorDraftState;
  leaseExpiresAt: string | null;
  heartbeatIntervalSeconds: number | null;
}

interface PersistCallbacks {
  onDraftRefreshed: (refreshed: Awaited<ReturnType<typeof fetchEditorDraft>>) => void;
  onError: (notice: EditorNoticeState) => void;
}

export async function persistDraft(
  input: PersistDraftInput,
  callbacks: PersistCallbacks,
) {
  try {
    const parsedLayoutMeta = parseLayoutMetaText(input.draftState.layoutMetaText);
    const layoutMeta = buildLayoutMetaWithHotspotLabels(
      parsedLayoutMeta,
      input.draftState.hotspots,
    );

    await saveEditorDraft({
      lease_id: input.leaseId,
      draft_version: input.draftVersion,
      base_layout_version: input.baseLayoutVersion,
      background_asset_id: input.draftState.backgroundAssetId,
      layout_meta: layoutMeta,
      hotspots: buildDraftHotspotInputs(input.draftState.hotspots),
    });

    const refreshed = await fetchEditorDraft(input.leaseId);
    callbacks.onDraftRefreshed(refreshed);
    return refreshed;
  } catch (error) {
    const apiError = normalizeApiError(error);
    callbacks.onError({
      tone: isConflictErrorCode(apiError.code) ? "warning" : "error",
      title: isConflictErrorCode(apiError.code)
        ? "请前往首页高级设置继续处理"
        : "保存首页草稿失败",
      detail: isConflictErrorCode(apiError.code)
        ? "当前草稿锁或版本已变化，首页轻编辑不再继续承载这次修改。"
        : apiError.message,
    });
    return null;
  }
}

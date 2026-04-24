import { useEffect, useRef, useState } from "react";
import {
  areEditorDraftStatesEqual,
  cloneEditorDraftState,
  EMPTY_EDITOR_DRAFT_STATE,
  resequenceHotspots,
  stringifyLayoutMeta,
  type EditorDraftState,
  type EditorDraftStateUpdater,
} from "../editorDraftState";
import { EditorViewModel } from "../../view-models/editor";

interface EditorHistoryEntry {
  draft: EditorDraftState;
  selectedHotspotId: string | null;
  batchSelectedHotspotIds: string[];
  label: string;
}

interface EditorHistoryGroup {
  key: string;
  timer: number | null;
}

interface EditorSnapshotKey {
  leaseId: string | null;
  draftVersion: string | null;
  baseLayoutVersion: string | null;
  lockStatus: string | null;
}

interface UseEditorDraftStateOptions {
  canEdit: boolean;
  draftSource: Record<string, unknown> | null;
  snapshot: EditorSnapshotKey;
  viewModel: EditorViewModel;
}

export function useEditorDraftState({
  canEdit,
  draftSource,
  snapshot,
  viewModel,
}: UseEditorDraftStateOptions) {
  const [draftState, setDraftStateValue] = useState<EditorDraftState>(
    EMPTY_EDITOR_DRAFT_STATE,
  );
  const [publishBaseline, setPublishBaseline] =
    useState<EditorDraftState | null>(null);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(
    null,
  );
  const [batchSelectedHotspotIds, setBatchSelectedHotspotIds] = useState<
    string[]
  >([]);
  const [historyState, setHistoryState] = useState<{
    undoCount: number;
    redoCount: number;
    lastAction: string | null;
  }>({
    undoCount: 0,
    redoCount: 0,
    lastAction: null,
  });
  const publishBaselineLeaseIdRef = useRef<string | null>(null);
  const draftStateRef = useRef(draftState);
  const publishBaselineRef = useRef(publishBaseline);
  const appliedEditorSnapshotRef = useRef<EditorSnapshotKey | null>(null);
  const undoStackRef = useRef<EditorHistoryEntry[]>([]);
  const redoStackRef = useRef<EditorHistoryEntry[]>([]);
  const historyGroupRef = useRef<EditorHistoryGroup | null>(null);

  function syncHistoryState(lastAction: string | null = historyState.lastAction) {
    setHistoryState({
      undoCount: undoStackRef.current.length,
      redoCount: redoStackRef.current.length,
      lastAction,
    });
  }

  function clearHistoryGroup() {
    if (historyGroupRef.current?.timer) {
      window.clearTimeout(historyGroupRef.current.timer);
    }
    historyGroupRef.current = null;
  }

  function markHistoryGroup(key: string) {
    if (historyGroupRef.current?.timer) {
      window.clearTimeout(historyGroupRef.current.timer);
    }
    historyGroupRef.current = {
      key,
      timer: window.setTimeout(() => {
        historyGroupRef.current = null;
      }, 700),
    };
  }

  function setDraftState(updater: EditorDraftStateUpdater) {
    setDraftStateValue((current) => {
      const next = updater(current);
      draftStateRef.current = next;
      return next;
    });
  }

  function pushDraftHistory(
    current: EditorDraftState,
    label: string,
    groupKey?: string,
  ) {
    if (groupKey && historyGroupRef.current?.key === groupKey) {
      markHistoryGroup(groupKey);
      return;
    }

    if (groupKey) {
      markHistoryGroup(groupKey);
    } else {
      clearHistoryGroup();
    }

    undoStackRef.current = [
      ...undoStackRef.current,
      {
        draft: cloneEditorDraftState(current),
        selectedHotspotId,
        batchSelectedHotspotIds: [...batchSelectedHotspotIds],
        label,
      },
    ].slice(-50);
    redoStackRef.current = [];
    syncHistoryState(label);
  }

  function updateDraftStateWithHistory(
    updater: EditorDraftStateUpdater,
    label: string,
    groupKey?: string,
  ) {
    if (!canEdit) {
      return;
    }

    setDraftStateValue((current) => {
      const next = updater(current);
      if (areEditorDraftStatesEqual(current, next)) {
        return current;
      }
      pushDraftHistory(current, label, groupKey);
      draftStateRef.current = next;
      return next;
    });
  }

  function restoreDraftHistoryEntry(entry: EditorHistoryEntry) {
    const restored = cloneEditorDraftState(entry.draft);
    draftStateRef.current = restored;
    setDraftStateValue(restored);
    setSelectedHotspotId(entry.selectedHotspotId);
    setBatchSelectedHotspotIds([...entry.batchSelectedHotspotIds]);
  }

  function undoDraftChange() {
    if (!canEdit || !undoStackRef.current.length) {
      return null;
    }

    clearHistoryGroup();
    const entry = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [
      ...redoStackRef.current,
      {
        draft: cloneEditorDraftState(draftState),
        selectedHotspotId,
        batchSelectedHotspotIds: [...batchSelectedHotspotIds],
        label: entry.label,
      },
    ].slice(-50);
    restoreDraftHistoryEntry(entry);
    syncHistoryState(entry.label);
    return entry.label;
  }

  function redoDraftChange() {
    if (!canEdit || !redoStackRef.current.length) {
      return null;
    }

    clearHistoryGroup();
    const entry = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [
      ...undoStackRef.current,
      {
        draft: cloneEditorDraftState(draftState),
        selectedHotspotId,
        batchSelectedHotspotIds: [...batchSelectedHotspotIds],
        label: entry.label,
      },
    ].slice(-50);
    restoreDraftHistoryEntry(entry);
    syncHistoryState(entry.label);
    return entry.label;
  }

  function selectSingleHotspot(
    hotspotId: string,
    options?: { keepBatch?: boolean },
  ) {
    setSelectedHotspotId(hotspotId);
    if (!options?.keepBatch) {
      setBatchSelectedHotspotIds([]);
    }
  }

  function replaceBatchSelection(hotspotIds: string[]) {
    const next = Array.from(new Set(hotspotIds));
    setBatchSelectedHotspotIds(next);
    setSelectedHotspotId(next[0] ?? null);
  }

  function toggleBatchHotspot(hotspotId: string) {
    setBatchSelectedHotspotIds((current) =>
      current.includes(hotspotId)
        ? current.filter((selectedId) => selectedId !== hotspotId)
        : [...current, hotspotId],
    );
  }

  function clearBatchSelection() {
    setBatchSelectedHotspotIds([]);
  }

  function resetSelection() {
    setSelectedHotspotId(null);
    setBatchSelectedHotspotIds([]);
  }

  useEffect(() => {
    return () => {
      clearHistoryGroup();
    };
  }, []);

  useEffect(() => {
    draftStateRef.current = draftState;
  }, [draftState]);

  useEffect(() => {
    publishBaselineRef.current = publishBaseline;
  }, [publishBaseline]);

  useEffect(() => {
    const nextDraftState = {
      backgroundAssetId: viewModel.backgroundAssetId,
      backgroundImageUrl: viewModel.backgroundImageUrl,
      backgroundImageSize: viewModel.backgroundImageSize,
      layoutMetaText: stringifyLayoutMeta(viewModel.layoutMeta),
      hotspots: resequenceHotspots(viewModel.hotspots),
    };
    const lastSnapshotKey = appliedEditorSnapshotRef.current;
    const isSameSnapshot =
      lastSnapshotKey?.leaseId === snapshot.leaseId &&
      lastSnapshotKey?.draftVersion === snapshot.draftVersion &&
      lastSnapshotKey?.baseLayoutVersion === snapshot.baseLayoutVersion &&
      lastSnapshotKey?.lockStatus === snapshot.lockStatus;
    const localBaseline = publishBaselineRef.current;
    const hasUnsavedLocalDraft =
      localBaseline !== null &&
      !areEditorDraftStatesEqual(draftStateRef.current, localBaseline);

    if (
      isSameSnapshot &&
      snapshot.lockStatus === "GRANTED" &&
      snapshot.leaseId &&
      hasUnsavedLocalDraft
    ) {
      return;
    }

    const nextHotspotIds = new Set(
      nextDraftState.hotspots.map((hotspot) => hotspot.id),
    );
    setDraftStateValue(nextDraftState);
    draftStateRef.current = nextDraftState;
    appliedEditorSnapshotRef.current = snapshot;
    clearHistoryGroup();
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryState(null);
    setSelectedHotspotId((current) =>
      current && nextHotspotIds.has(current)
        ? current
        : nextDraftState.hotspots[0]?.id ?? null,
    );
    setBatchSelectedHotspotIds((current) =>
      current.filter((hotspotId) => nextHotspotIds.has(hotspotId)),
    );

    if (snapshot.lockStatus !== "GRANTED" || !snapshot.leaseId) {
      publishBaselineLeaseIdRef.current = snapshot.leaseId ?? null;
      publishBaselineRef.current = nextDraftState;
      setPublishBaseline(nextDraftState);
      return;
    }

    if (publishBaselineLeaseIdRef.current !== snapshot.leaseId) {
      publishBaselineLeaseIdRef.current = snapshot.leaseId;
      publishBaselineRef.current = nextDraftState;
      setPublishBaseline(nextDraftState);
      return;
    }

    setPublishBaseline((current) => current ?? nextDraftState);
  }, [
    snapshot.baseLayoutVersion,
    draftSource,
    snapshot.draftVersion,
    snapshot.leaseId,
    snapshot.lockStatus,
  ]);

  return {
    batchSelectedHotspotIds,
    canRedo: canEdit && historyState.redoCount > 0,
    canUndo: canEdit && historyState.undoCount > 0,
    clearBatchSelection,
    draftState,
    historyState,
    publishBaseline,
    redoDraftChange,
    replaceBatchSelection,
    resetSelection,
    selectedHotspotId,
    selectSingleHotspot,
    setBatchSelectedHotspotIds,
    setDraftState,
    setSelectedHotspotId,
    toggleBatchHotspot,
    undoDraftChange,
    updateDraftStateWithHistory,
  };
}

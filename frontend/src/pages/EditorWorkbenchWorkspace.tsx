import { useEffect, useState } from "react";
import { EditorCanvasWorkspace } from "../components/editor/EditorCanvasWorkspace";
import { EditorCommandBar } from "../components/editor/EditorCommandBar";
import { EditorInspector } from "../components/editor/EditorInspector";
import { EditorRealtimeFeed } from "../components/editor/EditorRealtimeFeed";
import { EditorToolbox } from "../components/editor/EditorToolbox";
import {
  createEditorSession,
  fetchEditorDraft,
  publishEditorDraft,
  saveEditorDraft,
} from "../api/editorApi";
import { normalizeApiError } from "../api/httpClient";
import { appStore, useAppStore } from "../store/useAppStore";
import { mapEditorViewModel } from "../view-models/editor";
import { EditorHotspotViewModel } from "../view-models/editor";

interface EditorDraftState {
  backgroundImageUrl: string | null;
  layoutMetaText: string;
  hotspots: EditorHotspotViewModel[];
}

function stringifyLayoutMeta(value: Record<string, unknown>) {
  return JSON.stringify(value ?? {}, null, 2);
}

function sortHotspots(hotspots: EditorHotspotViewModel[]) {
  return [...hotspots].sort((left, right) => left.structureOrder - right.structureOrder);
}

function resequenceHotspots(hotspots: EditorHotspotViewModel[]) {
  return sortHotspots(hotspots).map((hotspot, index) => ({
    ...hotspot,
    structureOrder: index,
  }));
}

export function EditorWorkbenchWorkspace() {
  const session = useAppStore((state) => state.session);
  const editor = useAppStore((state) => state.editor);
  const pin = useAppStore((state) => state.pin);
  const events = useAppStore((state) => state.wsEvents);
  const terminalId = session.data?.terminalId;
  const pinSessionActive = session.data?.pinSessionActive ?? false;
  const [searchValue, setSearchValue] = useState("");
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<EditorDraftState>({
    backgroundImageUrl: null,
    layoutMetaText: "{}",
    hotspots: [],
  });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPublishingDraft, setIsPublishingDraft] = useState(false);

  useEffect(() => {
    if (!terminalId) {
      return;
    }

    let active = true;

    void (async () => {
      appStore.setEditorLoading();
      appStore.setEditorDraftLoading();

      try {
        if (pinSessionActive) {
          const lease = await createEditorSession(terminalId);
          if (!active) {
            return;
          }
          appStore.setEditorSession({
            lockStatus: lease.lock_status,
            leaseId: lease.lease_id,
          });

          const draft = await fetchEditorDraft(lease.lease_id);
          if (!active) {
            return;
          }
          appStore.setEditorDraftData({
            draft: draft.layout ?? null,
            draftVersion: draft.draft_version,
            baseLayoutVersion: draft.base_layout_version,
            readonly: draft.readonly,
            lockStatus: draft.lock_status,
          });
          return;
        }

        const draft = await fetchEditorDraft();
        if (!active) {
          return;
        }
        appStore.setEditorSession({
          lockStatus: draft.lock_status,
          leaseId: null,
        });
        appStore.setEditorDraftData({
          draft: draft.layout ?? null,
          draftVersion: draft.draft_version,
          baseLayoutVersion: draft.base_layout_version,
          readonly: draft.readonly,
          lockStatus: draft.lock_status,
        });
      } catch (error) {
        if (!active) {
          return;
        }
        appStore.setEditorError(normalizeApiError(error).message);
      }
    })();

    return () => {
      active = false;
    };
  }, [pinSessionActive, terminalId]);

  const viewModel = mapEditorViewModel({
    lockStatus: editor.lockStatus,
    leaseId: editor.leaseId,
    draft: editor.draft,
    draftVersion: editor.draftVersion,
    baseLayoutVersion: editor.baseLayoutVersion,
    readonly: editor.readonly,
    pinActive: pin.active,
    events,
  });

  useEffect(() => {
    setDraftState({
      backgroundImageUrl: viewModel.backgroundImageUrl,
      layoutMetaText: stringifyLayoutMeta(viewModel.layoutMeta),
      hotspots: resequenceHotspots(viewModel.hotspots),
    });
    setSelectedHotspotId((current) => current ?? viewModel.hotspots[0]?.id ?? null);
  }, [editor.draft, editor.draftVersion, editor.baseLayoutVersion]);

  const visibleHotspots = sortHotspots(
    draftState.hotspots.filter((hotspot) =>
      `${hotspot.label} ${hotspot.deviceId}`.toLowerCase().includes(searchValue.trim().toLowerCase()),
    ),
  );
  const selectedHotspot =
    visibleHotspots.find((hotspot) => hotspot.id === selectedHotspotId) ??
    draftState.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) ??
    null;
  const canEdit = !editor.readonly && editor.lockStatus === "GRANTED";

  function updateHotspotField(
    field: "deviceId" | "iconType" | "labelMode" | "x" | "y" | "structureOrder",
    value: string,
  ) {
    if (!selectedHotspotId) {
      return;
    }

    setDraftState((current) => {
      const nextHotspots = current.hotspots.map((hotspot) => {
        if (hotspot.id !== selectedHotspotId) {
          return hotspot;
        }

        if (field === "x" || field === "y") {
          const next = Math.min(Math.max(Number(value) / 100, 0), 1);
          return { ...hotspot, [field]: Number.isFinite(next) ? next : hotspot[field] };
        }

        if (field === "structureOrder") {
          const next = Number(value);
          return {
            ...hotspot,
            structureOrder: Number.isFinite(next)
              ? Math.max(0, Math.round(next))
              : hotspot.structureOrder,
          };
        }

        return { ...hotspot, [field]: value };
      });

      return {
        ...current,
        hotspots:
          field === "structureOrder" ? resequenceHotspots(nextHotspots) : nextHotspots,
      };
    });
  }

  function updateHotspotVisibility(visible: boolean) {
    if (!selectedHotspotId) {
      return;
    }

    setDraftState((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === selectedHotspotId ? { ...hotspot, isVisible: visible } : hotspot,
      ),
    }));
  }

  function moveHotspot(hotspotId: string, x: number, y: number) {
    if (!canEdit) {
      return;
    }

    setDraftState((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === hotspotId ? { ...hotspot, x, y } : hotspot,
      ),
    }));
  }

  function addHotspot() {
    if (!canEdit) {
      return;
    }

    const newHotspot: EditorHotspotViewModel = {
      id: `draft-hotspot-${Date.now()}`,
      label: `热点 ${draftState.hotspots.length + 1}`,
      deviceId: "",
      x: 0.5,
      y: 0.5,
      iconType: "device",
      labelMode: "AUTO",
      isVisible: true,
      structureOrder: draftState.hotspots.length,
    };

    setDraftState((current) => ({
      ...current,
      hotspots: resequenceHotspots([...current.hotspots, newHotspot]),
    }));
    setSelectedHotspotId(newHotspot.id);
  }

  function deleteSelectedHotspot() {
    if (!selectedHotspotId || !canEdit) {
      return;
    }

    setDraftState((current) => {
      const nextHotspots = resequenceHotspots(
        current.hotspots.filter((hotspot) => hotspot.id !== selectedHotspotId),
      );
      setSelectedHotspotId(nextHotspots[0]?.id ?? null);
      return {
        ...current,
        hotspots: nextHotspots,
      };
    });
  }

  function moveSelectedHotspot(direction: "up" | "down") {
    if (!selectedHotspotId || !canEdit) {
      return;
    }

    setDraftState((current) => {
      const ordered = sortHotspots(current.hotspots);
      const currentIndex = ordered.findIndex((hotspot) => hotspot.id === selectedHotspotId);
      if (currentIndex === -1) {
        return current;
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= ordered.length) {
        return current;
      }

      const next = [...ordered];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, moved);

      return {
        ...current,
        hotspots: next.map((hotspot, index) => ({ ...hotspot, structureOrder: index })),
      };
    });
  }

  async function refreshDraft(leaseId?: string | null) {
    const refreshed = await fetchEditorDraft(leaseId);
    appStore.setEditorDraftData({
      draft: refreshed.layout ?? null,
      draftVersion: refreshed.draft_version,
      baseLayoutVersion: refreshed.base_layout_version,
      readonly: refreshed.readonly,
      lockStatus: refreshed.lock_status,
    });
    return refreshed;
  }

  async function persistDraft(options?: { silent?: boolean }) {
    if (!terminalId || !editor.leaseId || !editor.draftVersion || !editor.baseLayoutVersion || !canEdit) {
      return null;
    }

    try {
      const layoutMeta = JSON.parse(draftState.layoutMetaText || "{}");
      await saveEditorDraft({
        terminal_id: terminalId,
        lease_id: editor.leaseId,
        draft_version: editor.draftVersion,
        base_layout_version: editor.baseLayoutVersion,
        background_asset_id: draftState.backgroundImageUrl,
        layout_meta: layoutMeta && typeof layoutMeta === "object" ? layoutMeta : {},
        hotspots: draftState.hotspots.map((hotspot, index) => ({
          hotspot_id: hotspot.id,
          device_id: hotspot.deviceId.trim(),
          x: hotspot.x,
          y: hotspot.y,
          icon_type: hotspot.iconType,
          label_mode: hotspot.labelMode,
          is_visible: hotspot.isVisible,
          structure_order: hotspot.structureOrder ?? index,
        })),
      });
      const refreshed = await refreshDraft(editor.leaseId);
      if (!options?.silent) {
        setSaveMessage("草稿已保存到后端。");
      }
      return refreshed;
    } catch (error) {
      appStore.setEditorError(normalizeApiError(error).message);
      return null;
    }
  }

  async function handleSaveDraft() {
    setSaveMessage(null);
    setIsSavingDraft(true);
    try {
      await persistDraft();
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function handlePublishDraft() {
    if (!terminalId || !editor.leaseId || !canEdit) {
      return;
    }

    setSaveMessage(null);
    setIsPublishingDraft(true);
    try {
      const refreshed = await persistDraft({ silent: true });
      if (!refreshed?.draft_version || !refreshed.base_layout_version) {
        return;
      }

      const published = await publishEditorDraft({
        terminal_id: terminalId,
        lease_id: editor.leaseId,
        draft_version: refreshed.draft_version,
        base_layout_version: refreshed.base_layout_version,
      });

      appStore.setEditorSession({
        lockStatus: "READ_ONLY",
        leaseId: null,
      });
      await refreshDraft();
      setSelectedHotspotId(null);
      setSaveMessage(`草稿已发布，布局版本为 ${published.layout_version}。`);
    } catch (error) {
      appStore.setEditorError(normalizeApiError(error).message);
    } finally {
      setIsPublishingDraft(false);
    }
  }

  const orderedHotspots = sortHotspots(draftState.hotspots);
  const selectedHotspotIndex = selectedHotspot
    ? orderedHotspots.findIndex((hotspot) => hotspot.id === selectedHotspot.id)
    : -1;

  return (
    <section className="page page--editor">
      {editor.error ? <p className="inline-error">{editor.error}</p> : null}
      {saveMessage ? <p className="inline-success">{saveMessage}</p> : null}
      <EditorCommandBar
        canSave={canEdit}
        canPublish={canEdit}
        helperText={viewModel.helperText}
        hotspotCount={draftState.hotspots.length}
        modeLabel={viewModel.modeLabel}
        onAddHotspot={addHotspot}
        onPublishDraft={() => void handlePublishDraft()}
        onSaveDraft={() => void handleSaveDraft()}
        publishBusy={isPublishingDraft}
        rows={viewModel.commandRows}
        saveBusy={isSavingDraft}
      />
      <div className="editor-workbench">
        <EditorToolbox
          canEdit={canEdit}
          hotspots={visibleHotspots}
          onSearchChange={setSearchValue}
          onSelectHotspot={setSelectedHotspotId}
          searchValue={searchValue}
          selectedHotspotId={selectedHotspotId}
        />
        <EditorCanvasWorkspace
          backgroundImageUrl={draftState.backgroundImageUrl}
          canEdit={canEdit}
          hotspots={draftState.hotspots}
          onMoveHotspot={moveHotspot}
          onSelectHotspot={setSelectedHotspotId}
          selectedHotspotId={selectedHotspotId}
        />
        <EditorInspector
          backgroundImageUrl={draftState.backgroundImageUrl}
          canEdit={canEdit}
          hotspot={selectedHotspot}
          layoutMetaText={draftState.layoutMetaText}
          canMoveDown={selectedHotspotIndex > -1 && selectedHotspotIndex < orderedHotspots.length - 1}
          canMoveUp={selectedHotspotIndex > 0}
          onChangeHotspot={updateHotspotField}
          onChangeLayoutMeta={(value) =>
            setDraftState((current) => ({ ...current, layoutMetaText: value }))
          }
          onDeleteHotspot={deleteSelectedHotspot}
          onMoveHotspot={moveSelectedHotspot}
          onToggleVisibility={updateHotspotVisibility}
          rows={viewModel.commandRows}
        />
      </div>
      <EditorRealtimeFeed rows={viewModel.eventRows} />
    </section>
  );
}

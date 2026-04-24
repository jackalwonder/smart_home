import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEditorSession,
  fetchEditorDraft,
  heartbeatEditorSession,
  publishEditorDraft,
  saveEditorDraft,
} from "../../api/editorApi";
import { normalizeApiError } from "../../api/httpClient";
import { DeviceListItemDto } from "../../api/types";
import { BottomStatsStrip } from "../../components/home/BottomStatsStrip";
import {
  areEditorDraftStatesEqual,
  buildDraftHotspotInputs,
  buildLayoutMetaWithHotspotLabels,
  cloneEditorDraftState,
  parseLayoutMetaText,
  resequenceHotspots,
  sortHotspots,
  stringifyLayoutMeta,
  type EditorDraftState,
} from "../../editor/editorDraftState";
import { PageFrame } from "../../components/layout/PageFrame";
import { appStore, useAppStore } from "../../store/useAppStore";
import { HOTSPOT_ICON_OPTIONS } from "../../utils/hotspotIcons";
import { EditorHotspotViewModel, mapEditorViewModel } from "../../view-models/editor";
import { HomeMetricViewModel } from "../../view-models/home";
import { EditorCanvasWorkspace } from "../editor/EditorCanvasWorkspace";
import { HotspotIcon } from "./HotspotIcon";

interface HomeStageEditorWorkspaceProps {
  devices: DeviceListItemDto[];
  stats: HomeMetricViewModel[];
  onApplied: () => Promise<void> | void;
  onExit: () => void;
  onOpenAdvancedSettings: () => void;
}

interface EditorHistoryEntry {
  draft: EditorDraftState;
  selectedHotspotId: string | null;
}

interface LightEditorSessionState {
  leaseId: string | null;
  draftVersion: string | null;
  baseLayoutVersion: string | null;
  leaseExpiresAt: string | null;
  heartbeatIntervalSeconds: number | null;
  lockStatus: string | null;
}

interface EditorNoticeState {
  tone: "success" | "warning" | "error";
  title: string;
  detail: string;
}

function clampPosition(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function buildDeviceHotspotId(deviceId: string) {
  const normalized = deviceId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
  return `home-hotspot-${normalized}-${Date.now()}`;
}

function getNextHotspotPosition(index: number) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: Math.min(0.18 + column * 0.18, 0.82),
    y: Math.min(0.24 + row * 0.14, 0.84),
  };
}

function createNewHotspot(index: number): EditorHotspotViewModel {
  const nextPosition = getNextHotspotPosition(index);
  return {
    id: `home-hotspot-manual-${Date.now()}`,
    label: `新热点 ${index + 1}`,
    deviceId: "",
    x: nextPosition.x,
    y: nextPosition.y,
    iconType: "device",
    iconAssetId: null,
    iconAssetUrl: null,
    labelMode: "AUTO",
    isVisible: true,
    structureOrder: index,
  };
}

function isConflictErrorCode(code: string) {
  return (
    code === "VERSION_CONFLICT" ||
    code === "DRAFT_LOCK_LOST" ||
    code === "DRAFT_LOCK_TAKEN_OVER"
  );
}

export function HomeStageEditorWorkspace({
  devices,
  stats,
  onApplied,
  onExit,
  onOpenAdvancedSettings,
}: HomeStageEditorWorkspaceProps) {
  const pin = useAppStore((state) => state.pin);
  const undoStackRef = useRef<EditorHistoryEntry[]>([]);
  const redoStackRef = useRef<EditorHistoryEntry[]>([]);
  const [editorSession, setEditorSession] = useState<LightEditorSessionState>({
    leaseId: null,
    draftVersion: null,
    baseLayoutVersion: null,
    leaseExpiresAt: null,
    heartbeatIntervalSeconds: null,
    lockStatus: null,
  });
  const [draftState, setDraftState] = useState<EditorDraftState>({
    backgroundAssetId: null,
    backgroundImageUrl: null,
    backgroundImageSize: null,
    layoutMetaText: "{}",
    hotspots: [],
  });
  const [baselineDraft, setBaselineDraft] = useState<EditorDraftState | null>(null);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState<"edit" | "preview">("edit");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [notice, setNotice] = useState<EditorNoticeState | null>(null);
  const [historyState, setHistoryState] = useState({
    undoCount: 0,
    redoCount: 0,
  });

  const canEdit = pin.active && editorSession.lockStatus === "GRANTED";
  const hasUnsavedChanges = baselineDraft
    ? !areEditorDraftStatesEqual(draftState, baselineDraft)
    : false;
  const selectedHotspot =
    draftState.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) ?? null;
  const placedDeviceIds = useMemo(
    () =>
      new Set(
        draftState.hotspots
          .map((hotspot) => hotspot.deviceId.trim())
          .filter((deviceId) => deviceId.length > 0),
      ),
    [draftState.hotspots],
  );
  const filteredUnplacedDevices = useMemo(() => {
    const keyword = deviceSearch.trim().toLowerCase();
    return devices
      .filter((device) => !placedDeviceIds.has(device.device_id))
      .filter((device) => {
        if (!keyword) {
          return true;
        }
        const source =
          `${device.display_name} ${device.room_name ?? ""} ${device.device_id}`.toLowerCase();
        return source.includes(keyword);
      })
      .slice(0, 8);
  }, [deviceSearch, devices, placedDeviceIds]);

  function syncHistoryState() {
    setHistoryState({
      undoCount: undoStackRef.current.length,
      redoCount: redoStackRef.current.length,
    });
  }

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

    const viewModel = mapEditorViewModel({
      lockStatus: draft.lock_status,
      leaseId: mergedSession.leaseId,
      leaseExpiresAt: mergedSession.leaseExpiresAt,
      heartbeatIntervalSeconds: mergedSession.heartbeatIntervalSeconds,
      lockedByTerminalId: null,
      draft: draft.layout ?? null,
      draftVersion: draft.draft_version,
      baseLayoutVersion: draft.base_layout_version,
      readonly: draft.readonly,
      pinActive: pin.active,
      events: [],
    });

    const nextDraftState = {
      backgroundAssetId: viewModel.backgroundAssetId,
      backgroundImageUrl: viewModel.backgroundImageUrl,
      backgroundImageSize: viewModel.backgroundImageSize,
      layoutMetaText: stringifyLayoutMeta(viewModel.layoutMeta),
      hotspots: resequenceHotspots(viewModel.hotspots),
    };

    setDraftState(nextDraftState);
    setBaselineDraft(nextDraftState);
    setSelectedHotspotId(viewModel.hotspots[0]?.id ?? null);
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryState();
    setNotice(null);
    applySessionState({
      draftVersion: draft.draft_version,
      baseLayoutVersion: draft.base_layout_version,
      lockStatus: draft.lock_status,
      ...nextSession,
    });
  }

  function pushHistory(current: EditorDraftState) {
    undoStackRef.current = [
      ...undoStackRef.current,
      {
        draft: cloneEditorDraftState(current),
        selectedHotspotId,
      },
    ].slice(-30);
    redoStackRef.current = [];
    syncHistoryState();
  }

  function updateDraft(
    updater: (current: EditorDraftState) => EditorDraftState,
  ) {
    if (!canEdit) {
      return;
    }

    setDraftState((current) => {
      const next = updater(current);
      if (areEditorDraftStatesEqual(current, next)) {
        return current;
      }
      pushHistory(current);
      return next;
    });
  }

  function undoChange() {
    if (!canEdit || !undoStackRef.current.length) {
      return;
    }
    const previous = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [
      ...redoStackRef.current,
      {
        draft: cloneEditorDraftState(draftState),
        selectedHotspotId,
      },
    ].slice(-30);
    setDraftState(cloneEditorDraftState(previous.draft));
    setSelectedHotspotId(previous.selectedHotspotId);
    syncHistoryState();
  }

  function redoChange() {
    if (!canEdit || !redoStackRef.current.length) {
      return;
    }
    const nextEntry = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [
      ...undoStackRef.current,
      {
        draft: cloneEditorDraftState(draftState),
        selectedHotspotId,
      },
    ].slice(-30);
    setDraftState(cloneEditorDraftState(nextEntry.draft));
    setSelectedHotspotId(nextEntry.selectedHotspotId);
    syncHistoryState();
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
    if (!pin.active) {
      setIsLoading(false);
      setNotice({
        tone: "warning",
        title: "需要管理 PIN",
        detail: "请先在设置页验证管理 PIN，再进入总览轻编辑。",
      });
      return;
    }

    void openLightEditorSession();
  }, [pin.active]);

  useEffect(() => {
    if (editorSession.lockStatus !== "GRANTED" || !editorSession.leaseId) {
      return;
    }

    const intervalSeconds = editorSession.heartbeatIntervalSeconds ?? 20;
    const heartbeatDelayMs = Math.max(5000, Math.floor(intervalSeconds * 750));
    let active = true;

    const timer = window.setInterval(() => {
      const leaseId = editorSession.leaseId;
      if (!leaseId) {
        return;
      }

      void (async () => {
        try {
          const heartbeat = await heartbeatEditorSession(leaseId);
          if (!active) {
            return;
          }
          applySessionState({
            leaseId: heartbeat.lease_id,
            leaseExpiresAt: heartbeat.lease_expires_at ?? null,
            lockStatus: heartbeat.lock_status,
          });
        } catch (error) {
          if (!active) {
            return;
          }
          const apiError = normalizeApiError(error);
          setNotice({
            tone: "warning",
            title: "首页轻编辑已中断",
            detail: isConflictErrorCode(apiError.code)
              ? "当前草稿锁状态已变化，请前往首页高级设置继续处理。"
              : apiError.message,
          });
          applySessionState({
            lockStatus: "READ_ONLY",
            leaseId: null,
            leaseExpiresAt: null,
          });
        }
      })();
    }, heartbeatDelayMs);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    editorSession.heartbeatIntervalSeconds,
    editorSession.leaseId,
    editorSession.lockStatus,
  ]);

  async function persistDraft() {
    if (
      !editorSession.leaseId ||
      !editorSession.draftVersion ||
      !editorSession.baseLayoutVersion ||
      !canEdit
    ) {
      return null;
    }

    try {
      const parsedLayoutMeta = parseLayoutMetaText(draftState.layoutMetaText);
      const layoutMeta = buildLayoutMetaWithHotspotLabels(
        parsedLayoutMeta,
        draftState.hotspots,
      );

      await saveEditorDraft({
        lease_id: editorSession.leaseId,
        draft_version: editorSession.draftVersion,
        base_layout_version: editorSession.baseLayoutVersion,
        background_asset_id: draftState.backgroundAssetId,
        layout_meta: layoutMeta,
        hotspots: buildDraftHotspotInputs(draftState.hotspots),
      });

      const refreshed = await fetchEditorDraft(editorSession.leaseId);
      applyDraftResponse(refreshed, {
        leaseId: editorSession.leaseId,
        leaseExpiresAt: editorSession.leaseExpiresAt,
        heartbeatIntervalSeconds: editorSession.heartbeatIntervalSeconds,
      });
      return refreshed;
    } catch (error) {
      const apiError = normalizeApiError(error);
      setNotice({
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

  async function handleExitEditor() {
    if (canEdit && hasUnsavedChanges) {
      setIsSaving(true);
      const saved = await persistDraft();
      setIsSaving(false);
      if (!saved) {
        return;
      }
    }
    onExit();
  }

  async function handleOpenAdvancedSettings() {
    if (canEdit && hasUnsavedChanges) {
      setIsSaving(true);
      const saved = await persistDraft();
      setIsSaving(false);
      if (!saved) {
        return;
      }
    }
    onOpenAdvancedSettings();
  }

  function setSelectedHotspotField(
    field: "label" | "iconType" | "labelMode",
    value: string,
  ) {
    if (!selectedHotspot) {
      return;
    }
    updateDraft((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === selectedHotspot.id ? { ...hotspot, [field]: value } : hotspot,
      ),
    }));
  }

  function toggleSelectedVisibility(visible: boolean) {
    if (!selectedHotspot) {
      return;
    }
    updateDraft((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === selectedHotspot.id ? { ...hotspot, isVisible: visible } : hotspot,
      ),
    }));
  }

  function addHotspot() {
    const nextHotspot = createNewHotspot(draftState.hotspots.length);
    updateDraft((current) => ({
      ...current,
      hotspots: [...current.hotspots, nextHotspot],
    }));
    setSelectedHotspotId(nextHotspot.id);
  }

  function addDeviceHotspot(device: DeviceListItemDto) {
    updateDraft((current) => {
      const nextPosition = getNextHotspotPosition(current.hotspots.length);
      const nextHotspot: EditorHotspotViewModel = {
        id: buildDeviceHotspotId(device.device_id),
        label: device.display_name,
        deviceId: device.device_id,
        x: nextPosition.x,
        y: nextPosition.y,
        iconType: "device",
        iconAssetId: null,
        iconAssetUrl: null,
        labelMode: "AUTO",
        isVisible: true,
        structureOrder: current.hotspots.length,
      };
      setSelectedHotspotId(nextHotspot.id);
      return {
        ...current,
        hotspots: [...current.hotspots, nextHotspot],
      };
    });
  }

  function deleteSelectedHotspot() {
    if (!selectedHotspot) {
      return;
    }
    updateDraft((current) => {
      const nextHotspots = resequenceHotspots(
        current.hotspots.filter((hotspot) => hotspot.id !== selectedHotspot.id),
      );
      setSelectedHotspotId(nextHotspots[0]?.id ?? null);
      return {
        ...current,
        hotspots: nextHotspots,
      };
    });
  }

  function nudgeSelectedHotspot(direction: "left" | "right" | "up" | "down") {
    if (!selectedHotspot) {
      return;
    }
    const delta = 0.01;
    updateDraft((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) => {
        if (hotspot.id !== selectedHotspot.id) {
          return hotspot;
        }
        return {
          ...hotspot,
          x:
            direction === "left"
              ? clampPosition(hotspot.x - delta)
              : direction === "right"
                ? clampPosition(hotspot.x + delta)
                : hotspot.x,
          y:
            direction === "up"
              ? clampPosition(hotspot.y - delta)
              : direction === "down"
                ? clampPosition(hotspot.y + delta)
                : hotspot.y,
        };
      }),
    }));
  }

  function moveHotspot(hotspotId: string, x: number, y: number) {
    updateDraft((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === hotspotId ? { ...hotspot, x, y } : hotspot,
      ),
    }));
  }

  function moveHotspots(updates: Array<{ hotspotId: string; x: number; y: number }>) {
    updateDraft((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) => {
        const nextUpdate = updates.find((update) => update.hotspotId === hotspot.id);
        return nextUpdate ? { ...hotspot, x: nextUpdate.x, y: nextUpdate.y } : hotspot;
      }),
    }));
  }

  function selectHotspot(hotspotId: string) {
    setSelectedHotspotId(hotspotId);
  }

  return (
    <section className="page page--home home-stage-editor">
      {notice ? (
        <section className={`home-stage-editor__notice is-${notice.tone}`}>
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.detail}</p>
          </div>
          <div className="badge-row">
            <button
              className="button button--ghost"
              onClick={() => void handleOpenAdvancedSettings()}
              type="button"
            >
              更多首页高级设置
            </button>
            <button
              className="button button--ghost"
              onClick={() => void handleExitEditor()}
              type="button"
            >
              退出编辑
            </button>
          </div>
        </section>
      ) : null}

      <PageFrame
        aside={
          <aside className="utility-card home-stage-editor__sidebar">
            <span className="card-eyebrow">轻编辑</span>
            <h3>{selectedHotspot ? selectedHotspot.label : "首页舞台属性"}</h3>
            <p className="muted-copy">
              这里保留首页轻编辑所需的单热点属性和快捷布点入口；草稿治理、资源上传和批量编排请去高级设置。
            </p>

            {selectedHotspot ? (
              <div className="settings-form-grid">
                <label className="form-field form-field--full">
                  <span>热点名称</span>
                  <input
                    className="control-input"
                    disabled={!canEdit}
                    onChange={(event) =>
                      setSelectedHotspotField("label", event.target.value)
                    }
                    value={selectedHotspot.label}
                  />
                </label>
                <label className="form-field">
                  <span>图标类型</span>
                  <select
                    className="control-input"
                    disabled={!canEdit}
                    onChange={(event) =>
                      setSelectedHotspotField("iconType", event.target.value)
                    }
                    value={selectedHotspot.iconType}
                  >
                    {HOTSPOT_ICON_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>标签模式</span>
                  <select
                    className="control-input"
                    disabled={!canEdit}
                    onChange={(event) =>
                      setSelectedHotspotField("labelMode", event.target.value)
                    }
                    value={selectedHotspot.labelMode}
                  >
                    <option value="AUTO">自动</option>
                    <option value="ALWAYS">始终显示</option>
                    <option value="HIDDEN">隐藏</option>
                  </select>
                </label>
                <label className="toggle-field toggle-field--panel form-field--full">
                  <input
                    checked={selectedHotspot.isVisible}
                    disabled={!canEdit}
                    onChange={(event) => toggleSelectedVisibility(event.target.checked)}
                    type="checkbox"
                  />
                  <span>在首页舞台中显示</span>
                </label>
                <div className="home-stage-editor__selected-preview form-field--full">
                  <span className="home-stage-editor__selected-icon">
                    <HotspotIcon iconType={selectedHotspot.iconType} />
                  </span>
                  <div>
                    <strong>{selectedHotspot.label}</strong>
                    <small>{`${Math.round(selectedHotspot.x * 100)}%, ${Math.round(
                      selectedHotspot.y * 100,
                    )}%`}</small>
                  </div>
                </div>
                <div className="settings-module-card__actions form-field--full">
                  <button
                    className="button button--ghost"
                    disabled={!canEdit}
                    onClick={() => nudgeSelectedHotspot("left")}
                    type="button"
                  >
                    左移 1%
                  </button>
                  <button
                    className="button button--ghost"
                    disabled={!canEdit}
                    onClick={() => nudgeSelectedHotspot("right")}
                    type="button"
                  >
                    右移 1%
                  </button>
                  <button
                    className="button button--ghost"
                    disabled={!canEdit}
                    onClick={() => nudgeSelectedHotspot("up")}
                    type="button"
                  >
                    上移 1%
                  </button>
                  <button
                    className="button button--ghost"
                    disabled={!canEdit}
                    onClick={() => nudgeSelectedHotspot("down")}
                    type="button"
                  >
                    下移 1%
                  </button>
                  <button
                    className="button button--ghost button--danger"
                    disabled={!canEdit}
                    onClick={deleteSelectedHotspot}
                    type="button"
                  >
                    删除热点
                  </button>
                </div>
              </div>
            ) : (
              <p className="muted-copy">先在舞台上选择一个热点，再编辑它的轻量属性。</p>
            )}

            <div className="home-stage-editor__device-list">
              <div className="home-stage-editor__device-list-header">
                <span className="card-eyebrow">快速布点</span>
                <strong>未布点设备</strong>
              </div>
              <label className="form-field">
                <span>搜索设备</span>
                <input
                  className="control-input"
                  onChange={(event) => setDeviceSearch(event.target.value)}
                  placeholder="设备名 / 房间 / ID"
                  value={deviceSearch}
                />
              </label>
              <div className="home-stage-editor__device-items">
                {filteredUnplacedDevices.length ? (
                  filteredUnplacedDevices.map((device) => (
                    <button
                      className="home-stage-editor__device-item"
                      disabled={!canEdit}
                      key={device.device_id}
                      onClick={() => addDeviceHotspot(device)}
                      type="button"
                    >
                      <strong>{device.display_name}</strong>
                      <span>{device.room_name || "未分配房间"}</span>
                    </button>
                  ))
                ) : (
                  <p className="muted-copy">当前没有可直接加入舞台的未布点设备。</p>
                )}
              </div>
            </div>
          </aside>
        }
        className="page-frame--home"
        footer={<BottomStatsStrip stats={stats} />}
      >
        <div className="home-stage-editor__main">
          <header className="panel home-stage-editor__toolbar">
            <div>
              <span className="card-eyebrow">总览轻编辑</span>
              <h2>编辑首页</h2>
              <p className="muted-copy">
                在这里直接改舞台上的热点位置和基础视觉属性；复杂资源、批量编排和草稿发布治理继续留在设置页。
              </p>
            </div>
            <div className="badge-row">
              <span className="state-chip">
                {canEdit ? "编辑锁已授予" : "请前往高级设置处理锁状态"}
              </span>
              <span className="state-chip">
                {hasUnsavedChanges ? "有未应用更改" : "当前已同步"}
              </span>
              <button
                className="button button--ghost"
                disabled={!canEdit}
                onClick={addHotspot}
                type="button"
              >
                新增热点
              </button>
              <button
                className="button button--ghost"
                disabled={!canEdit || historyState.undoCount === 0}
                onClick={undoChange}
                type="button"
              >
                撤销
              </button>
              <button
                className="button button--ghost"
                disabled={!canEdit || historyState.redoCount === 0}
                onClick={redoChange}
                type="button"
              >
                重做
              </button>
              <button
                className="button button--ghost"
                disabled={isSaving || isApplying}
                onClick={() => void handleOpenAdvancedSettings()}
                type="button"
              >
                更多首页高级设置
              </button>
              <button
                className="button button--ghost"
                disabled={isSaving || isApplying}
                onClick={() => void handleExitEditor()}
                type="button"
              >
                退出编辑
              </button>
              <button
                className="button button--primary"
                disabled={!canEdit || isApplying || isLoading}
                onClick={() => void handleApplyChanges()}
                type="button"
              >
                {isApplying ? "应用中..." : "应用首页更改"}
              </button>
            </div>
          </header>

          {isLoading ? (
            <section className="panel home-stage-editor__loading">
              <strong>正在准备首页轻编辑…</strong>
              <p className="muted-copy">正在申请轻编辑锁并加载当前首页草稿。</p>
            </section>
          ) : (
            <EditorCanvasWorkspace
              batchSelectedHotspotIds={[]}
              backgroundImageSize={draftState.backgroundImageSize}
              backgroundImageUrl={draftState.backgroundImageUrl}
              canEdit={canEdit}
              hotspots={draftState.hotspots}
              mode={canvasMode}
              onBackgroundImageSizeChange={(backgroundImageSize) =>
                setDraftState((current) => ({
                  ...current,
                  backgroundImageSize,
                }))
              }
              onModeChange={setCanvasMode}
              onMoveHotspot={moveHotspot}
              onMoveHotspots={moveHotspots}
              onReplaceBatchSelection={(hotspotIds) => {
                setSelectedHotspotId(hotspotIds[0] ?? null);
              }}
              onSelectHotspot={(hotspotId) => selectHotspot(hotspotId)}
              selectedHotspotId={selectedHotspotId}
            />
          )}
        </div>
      </PageFrame>
    </section>
  );
}

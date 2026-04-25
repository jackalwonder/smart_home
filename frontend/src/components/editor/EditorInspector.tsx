import { DeviceListItemDto } from "../../api/types";
import { EditorHotspotViewModel } from "../../view-models/editor";
import { EditorBatchInspector } from "./EditorBatchInspector";
import { EditorInspectorBackgroundPanel } from "./EditorInspectorBackgroundPanel";
import { EditorSingleHotspotInspector } from "./EditorSingleHotspotInspector";
import {
  EditorBulkAlignAction,
  EditorBulkDistributeAction,
  EditorHotspotField,
} from "./editorInspectorTypes";

interface EditorInspectorProps {
  hotspot: EditorHotspotViewModel | null;
  batchHotspots: EditorHotspotViewModel[];
  canEdit: boolean;
  devices: DeviceListItemDto[];
  backgroundAssetId: string | null;
  backgroundImageUrl: string | null;
  layoutMetaText: string;
  rows: Array<{ label: string; value: string }>;
  isUploadingBackground: boolean;
  isUploadingHotspotIcon: boolean;
  onChangeHotspot: (field: EditorHotspotField, value: string) => void;
  onClearBackground: () => void;
  onDuplicateHotspot: () => void;
  onNudgeHotspot: (direction: "left" | "right" | "up" | "down") => void;
  onUploadBackground: (file: File) => void;
  onUploadHotspotIcon: (file: File) => void;
  onClearHotspotIcon: () => void;
  onToggleVisibility: (visible: boolean) => void;
  onChangeLayoutMeta: (value: string) => void;
  onDeleteHotspot: () => void;
  onMoveHotspot: (direction: "up" | "down") => void;
  onBulkAlign: (action: EditorBulkAlignAction) => void;
  onBulkDistribute: (action: EditorBulkDistributeAction) => void;
  onBulkSetPosition: (axis: "x" | "y", value: string) => void;
  onBulkDistributeByStep: (axis: "x" | "y", value: string) => void;
  onBulkSetVisibility: (visible: boolean) => void;
  onBulkSetIconType: (value: string) => void;
  onBulkSetLabelMode: (value: string) => void;
  onClearBatchSelection: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function EditorInspector({
  hotspot,
  batchHotspots,
  canEdit,
  devices,
  backgroundAssetId,
  backgroundImageUrl,
  layoutMetaText,
  rows,
  isUploadingBackground,
  isUploadingHotspotIcon,
  onChangeHotspot,
  onClearBackground,
  onDuplicateHotspot,
  onNudgeHotspot,
  onUploadBackground,
  onUploadHotspotIcon,
  onClearHotspotIcon,
  onToggleVisibility,
  onChangeLayoutMeta,
  onDeleteHotspot,
  onMoveHotspot,
  onBulkAlign,
  onBulkDistribute,
  onBulkSetPosition,
  onBulkDistributeByStep,
  onBulkSetVisibility,
  onBulkSetIconType,
  onBulkSetLabelMode,
  onClearBatchSelection,
  canMoveUp,
  canMoveDown,
}: EditorInspectorProps) {
  return (
    <aside className="utility-card editor-inspector">
      <span className="card-eyebrow">检查器</span>
      <h3>{hotspot ? hotspot.label : "会话信息"}</h3>
      <dl className="field-grid">
        {hotspot ? (
          <>
            <div>
              <dt>热点 ID</dt>
              <dd>{hotspot.id}</dd>
            </div>
            <div>
              <dt>位置</dt>
              <dd>{`${Math.round(hotspot.x * 100)}%, ${Math.round(hotspot.y * 100)}%`}</dd>
            </div>
          </>
        ) : (
          rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))
        )}
      </dl>
      <EditorBatchInspector
        batchHotspots={batchHotspots}
        canEdit={canEdit}
        onBulkAlign={onBulkAlign}
        onBulkDistribute={onBulkDistribute}
        onBulkDistributeByStep={onBulkDistributeByStep}
        onBulkSetIconType={onBulkSetIconType}
        onBulkSetLabelMode={onBulkSetLabelMode}
        onBulkSetPosition={onBulkSetPosition}
        onBulkSetVisibility={onBulkSetVisibility}
        onClearBatchSelection={onClearBatchSelection}
      />
      {hotspot ? (
        <EditorSingleHotspotInspector
          canEdit={canEdit}
          canMoveDown={canMoveDown}
          canMoveUp={canMoveUp}
          devices={devices}
          hotspot={hotspot}
          isUploadingHotspotIcon={isUploadingHotspotIcon}
          onChangeHotspot={onChangeHotspot}
          onClearHotspotIcon={onClearHotspotIcon}
          onDeleteHotspot={onDeleteHotspot}
          onDuplicateHotspot={onDuplicateHotspot}
          onMoveHotspot={onMoveHotspot}
          onNudgeHotspot={onNudgeHotspot}
          onToggleVisibility={onToggleVisibility}
          onUploadHotspotIcon={onUploadHotspotIcon}
        />
      ) : null}
      <EditorInspectorBackgroundPanel
        backgroundAssetId={backgroundAssetId}
        backgroundImageUrl={backgroundImageUrl}
        canEdit={canEdit}
        isUploadingBackground={isUploadingBackground}
        layoutMetaText={layoutMetaText}
        onChangeLayoutMeta={onChangeLayoutMeta}
        onClearBackground={onClearBackground}
        onUploadBackground={onUploadBackground}
      />
    </aside>
  );
}

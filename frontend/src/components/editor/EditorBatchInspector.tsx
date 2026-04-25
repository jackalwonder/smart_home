import { useState } from "react";
import { EditorHotspotViewModel } from "../../view-models/editor";
import { HOTSPOT_ICON_OPTIONS } from "../../utils/hotspotIcons";
import { EditorBulkAlignAction, EditorBulkDistributeAction } from "./editorInspectorTypes";

interface EditorBatchInspectorProps {
  batchHotspots: EditorHotspotViewModel[];
  canEdit: boolean;
  onBulkAlign: (action: EditorBulkAlignAction) => void;
  onBulkDistribute: (action: EditorBulkDistributeAction) => void;
  onBulkDistributeByStep: (axis: "x" | "y", value: string) => void;
  onBulkSetIconType: (value: string) => void;
  onBulkSetLabelMode: (value: string) => void;
  onBulkSetPosition: (axis: "x" | "y", value: string) => void;
  onBulkSetVisibility: (visible: boolean) => void;
  onClearBatchSelection: () => void;
}

export function EditorBatchInspector({
  batchHotspots,
  canEdit,
  onBulkAlign,
  onBulkDistribute,
  onBulkDistributeByStep,
  onBulkSetIconType,
  onBulkSetLabelMode,
  onBulkSetPosition,
  onBulkSetVisibility,
  onClearBatchSelection,
}: EditorBatchInspectorProps) {
  const batchNames = batchHotspots
    .slice(0, 4)
    .map((item) => item.label)
    .join("、");
  const [batchX, setBatchX] = useState("");
  const [batchY, setBatchY] = useState("");
  const [batchHorizontalGap, setBatchHorizontalGap] = useState("");
  const [batchVerticalGap, setBatchVerticalGap] = useState("");

  if (!batchHotspots.length) {
    return null;
  }

  return (
    <section className="editor-inspector__bulk">
      <div>
        <span className="card-eyebrow">批量编辑</span>
        <h4>{batchHotspots.length} 个热点已选</h4>
        <p className="muted-copy">
          {batchNames}
          {batchHotspots.length > 4 ? " 等" : ""}
        </p>
      </div>
      <div className="settings-module-card__actions">
        <button
          className="button button--ghost"
          disabled={!canEdit || batchHotspots.length < 2}
          onClick={() => onBulkAlign("left")}
          type="button"
        >
          左对齐
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || batchHotspots.length < 2}
          onClick={() => onBulkAlign("right")}
          type="button"
        >
          右对齐
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || batchHotspots.length < 2}
          onClick={() => onBulkAlign("top")}
          type="button"
        >
          顶部对齐
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || batchHotspots.length < 2}
          onClick={() => onBulkAlign("bottom")}
          type="button"
        >
          底部对齐
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || batchHotspots.length < 2}
          onClick={() => onBulkAlign("centerX")}
          type="button"
        >
          横向居中
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || batchHotspots.length < 2}
          onClick={() => onBulkAlign("centerY")}
          type="button"
        >
          纵向居中
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || batchHotspots.length < 3}
          onClick={() => onBulkDistribute("horizontal")}
          type="button"
        >
          横向等距
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || batchHotspots.length < 3}
          onClick={() => onBulkDistribute("vertical")}
          type="button"
        >
          纵向等距
        </button>
      </div>
      <div className="settings-form-grid">
        <label className="form-field">
          <span>统一 X (%)</span>
          <input
            className="control-input"
            disabled={!canEdit}
            max="100"
            min="0"
            onChange={(event) => setBatchX(event.target.value)}
            placeholder="例如 35"
            type="number"
            value={batchX}
          />
        </label>
        <label className="form-field">
          <span>统一 Y (%)</span>
          <input
            className="control-input"
            disabled={!canEdit}
            max="100"
            min="0"
            onChange={(event) => setBatchY(event.target.value)}
            placeholder="例如 45"
            type="number"
            value={batchY}
          />
        </label>
        <label className="form-field">
          <span>横向间距 (%)</span>
          <input
            className="control-input"
            disabled={!canEdit || batchHotspots.length < 2}
            max="100"
            min="0"
            onChange={(event) => setBatchHorizontalGap(event.target.value)}
            placeholder="例如 8"
            type="number"
            value={batchHorizontalGap}
          />
        </label>
        <label className="form-field">
          <span>纵向间距 (%)</span>
          <input
            className="control-input"
            disabled={!canEdit || batchHotspots.length < 2}
            max="100"
            min="0"
            onChange={(event) => setBatchVerticalGap(event.target.value)}
            placeholder="例如 8"
            type="number"
            value={batchVerticalGap}
          />
        </label>
      </div>
      <div className="settings-module-card__actions">
        <button
          className="button button--ghost"
          disabled={!canEdit || !batchX}
          onClick={() => onBulkSetPosition("x", batchX)}
          type="button"
        >
          应用 X
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || !batchY}
          onClick={() => onBulkSetPosition("y", batchY)}
          type="button"
        >
          应用 Y
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || batchHotspots.length < 2 || !batchHorizontalGap}
          onClick={() => onBulkDistributeByStep("x", batchHorizontalGap)}
          type="button"
        >
          套用横向间距
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || batchHotspots.length < 2 || !batchVerticalGap}
          onClick={() => onBulkDistributeByStep("y", batchVerticalGap)}
          type="button"
        >
          套用纵向间距
        </button>
      </div>
      <div className="settings-form-grid">
        <label className="form-field">
          <span>统一图标</span>
          <select
            className="control-input"
            disabled={!canEdit}
            onChange={(event) => {
              if (event.target.value) {
                onBulkSetIconType(event.target.value);
                event.currentTarget.value = "";
              }
            }}
            value=""
          >
            <option value="">选择图标类型</option>
            {HOTSPOT_ICON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>统一标签模式</span>
          <select
            className="control-input"
            disabled={!canEdit}
            onChange={(event) => {
              if (event.target.value) {
                onBulkSetLabelMode(event.target.value);
                event.currentTarget.value = "";
              }
            }}
            value=""
          >
            <option value="">选择标签模式</option>
            <option value="AUTO">自动</option>
            <option value="ALWAYS">始终显示</option>
            <option value="HIDDEN">隐藏</option>
          </select>
        </label>
      </div>
      <div className="settings-module-card__actions">
        <button
          className="button button--ghost"
          disabled={!canEdit}
          onClick={() => onBulkSetVisibility(true)}
          type="button"
        >
          显示所选
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit}
          onClick={() => onBulkSetVisibility(false)}
          type="button"
        >
          隐藏所选
        </button>
        <button className="button button--ghost" onClick={onClearBatchSelection} type="button">
          清空批量选择
        </button>
      </div>
    </section>
  );
}

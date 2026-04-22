import { useState } from "react";
import { EditorHotspotViewModel } from "../../view-models/editor";
import { DeviceListItemDto } from "../../api/types";
import { HotspotIcon } from "../home/HotspotIcon";
import { HOTSPOT_ICON_OPTIONS } from "../../utils/hotspotIcons";

type EditorHotspotField =
  | "label"
  | "deviceId"
  | "iconType"
  | "labelMode"
  | "x"
  | "y"
  | "structureOrder";

type EditorBulkAlignAction = "left" | "right" | "top" | "bottom" | "centerX" | "centerY";
type EditorBulkDistributeAction = "horizontal" | "vertical";

const ICON_TYPE_OPTIONS = [
  { value: "device", label: "通用设备" },
  { value: "light", label: "灯光" },
  { value: "fan", label: "风扇" },
  { value: "climate", label: "空调" },
  { value: "curtain", label: "窗帘" },
  { value: "sensor", label: "传感器" },
  { value: "media", label: "媒体" },
];

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
  const batchNames = batchHotspots
    .slice(0, 4)
    .map((item) => item.label)
    .join("、");
  const hasBatchSelection = batchHotspots.length > 0;
  const [batchX, setBatchX] = useState("");
  const [batchY, setBatchY] = useState("");
  const [batchHorizontalGap, setBatchHorizontalGap] = useState("");
  const [batchVerticalGap, setBatchVerticalGap] = useState("");

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
      {hasBatchSelection ? (
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
      ) : null}
      {hotspot ? (
        <div className="settings-form-grid">
          <label className="form-field">
            <span>显示名称</span>
            <input
              className="control-input"
              disabled={!canEdit}
              maxLength={64}
              onChange={(event) => onChangeHotspot("label", event.target.value)}
              value={hotspot.label}
            />
          </label>
          <label className="form-field">
            <span>绑定设备</span>
            <select
              className="control-input"
              disabled={!canEdit}
              onChange={(event) => onChangeHotspot("deviceId", event.target.value)}
              value={hotspot.deviceId}
            >
              <option value="">未绑定</option>
              {devices.map((device) => (
                <option key={device.device_id} value={device.device_id}>
                  {`${device.display_name} · ${device.room_name || "未分配房间"}`}
                </option>
              ))}
              {hotspot.deviceId && !devices.some((device) => device.device_id === hotspot.deviceId) ? (
                <option value={hotspot.deviceId}>{hotspot.deviceId}</option>
              ) : null}
            </select>
          </label>
          <label className="form-field">
            <span>设备 ID</span>
            <input
              className="control-input"
              disabled={!canEdit}
              onChange={(event) => onChangeHotspot("deviceId", event.target.value)}
              value={hotspot.deviceId}
            />
          </label>
          <label className="form-field">
            <span>图标类型</span>
            <select
              className="control-input"
              disabled={!canEdit}
              onChange={(event) => onChangeHotspot("iconType", event.target.value)}
              value={hotspot.iconType}
            >
              {HOTSPOT_ICON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              {hotspot.iconType && !HOTSPOT_ICON_OPTIONS.some((option) => option.value === hotspot.iconType) ? (
                <option value={hotspot.iconType}>{hotspot.iconType}</option>
              ) : null}
            </select>
          </label>
          <label className="form-field">
            <span>标签模式</span>
            <select
              className="control-input"
              disabled={!canEdit}
              onChange={(event) => onChangeHotspot("labelMode", event.target.value)}
              value={hotspot.labelMode}
            >
              <option value="AUTO">自动</option>
              <option value="ALWAYS">始终显示</option>
              <option value="HIDDEN">隐藏</option>
            </select>
          </label>
          <div className="form-field form-field--full editor-hotspot-icon-picker">
            <span>Hotspot icon</span>
            <div className="editor-hotspot-icon-picker__preview">
              <span className="editor-hotspot-icon-picker__sample">
                <HotspotIcon
                  iconAssetUrl={hotspot.iconAssetUrl}
                  iconType={hotspot.iconType}
                />
              </span>
              <div>
                <strong>{hotspot.iconAssetId ? "Custom icon" : "Built-in icon"}</strong>
                <small>{hotspot.iconAssetId ?? hotspot.iconType}</small>
              </div>
            </div>
            <div className="editor-hotspot-icon-picker__grid">
              {HOTSPOT_ICON_OPTIONS.map((option) => (
                <button
                  aria-label={`Use ${option.label} icon`}
                  className={hotspot.iconType === option.value && !hotspot.iconAssetId ? "is-selected" : ""}
                  disabled={!canEdit}
                  key={option.value}
                  onClick={() => onChangeHotspot("iconType", option.value)}
                  type="button"
                >
                  <HotspotIcon iconType={option.value} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <input
              accept="image/svg+xml,image/png,image/webp,image/jpeg"
              className="control-input"
              disabled={!canEdit || isUploadingHotspotIcon}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onUploadHotspotIcon(file);
                }
                event.currentTarget.value = "";
              }}
              type="file"
            />
            <div className="settings-module-card__actions">
              <button
                className="button button--ghost"
                disabled={!canEdit || !hotspot.iconAssetId}
                onClick={onClearHotspotIcon}
                type="button"
              >
                Use built-in icon
              </button>
            </div>
          </div>
          <label className="form-field">
            <span>X (%)</span>
            <input
              className="control-input"
              disabled={!canEdit}
              max="100"
              min="0"
              onChange={(event) => onChangeHotspot("x", event.target.value)}
              type="number"
              value={Math.round(hotspot.x * 100)}
            />
          </label>
          <label className="form-field">
            <span>Y (%)</span>
            <input
              className="control-input"
              disabled={!canEdit}
              max="100"
              min="0"
              onChange={(event) => onChangeHotspot("y", event.target.value)}
              type="number"
              value={Math.round(hotspot.y * 100)}
            />
          </label>
          <label className="form-field">
            <span>排序</span>
            <input
              className="control-input"
              disabled={!canEdit}
              onChange={(event) => onChangeHotspot("structureOrder", event.target.value)}
              type="number"
              value={hotspot.structureOrder}
            />
          </label>
          <label className="toggle-field toggle-field--panel">
            <input
              checked={hotspot.isVisible}
              disabled={!canEdit}
              onChange={(event) => onToggleVisibility(event.target.checked)}
              type="checkbox"
            />
            <span>在画布中显示</span>
          </label>
          <div className="settings-module-card__actions form-field--full">
            <button
              className="button button--ghost"
              disabled={!canEdit}
              onClick={() => onNudgeHotspot("left")}
              type="button"
            >
              左移 1%
            </button>
            <button
              className="button button--ghost"
              disabled={!canEdit}
              onClick={() => onNudgeHotspot("right")}
              type="button"
            >
              右移 1%
            </button>
            <button
              className="button button--ghost"
              disabled={!canEdit}
              onClick={() => onNudgeHotspot("up")}
              type="button"
            >
              上移 1%
            </button>
            <button
              className="button button--ghost"
              disabled={!canEdit}
              onClick={() => onNudgeHotspot("down")}
              type="button"
            >
              下移 1%
            </button>
          </div>
          <div className="settings-module-card__actions form-field--full">
            <button
              className="button button--ghost"
              disabled={!canEdit}
              onClick={onDuplicateHotspot}
              type="button"
            >
              复制热点
            </button>
            <button
              className="button button--ghost"
              disabled={!canEdit || !canMoveUp}
              onClick={() => onMoveHotspot("up")}
              type="button"
            >
              上移
            </button>
            <button
              className="button button--ghost"
              disabled={!canEdit || !canMoveDown}
              onClick={() => onMoveHotspot("down")}
              type="button"
            >
              下移
            </button>
            <button
              className="button button--ghost button--danger"
              disabled={!canEdit}
              onClick={onDeleteHotspot}
              type="button"
            >
              删除热点
            </button>
          </div>
        </div>
      ) : null}
      <div className="editor-inspector__meta">
        <label className="form-field form-field--full">
          <span>上传背景图</span>
          <input
            accept="image/*"
            className="control-input"
            disabled={!canEdit || isUploadingBackground}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onUploadBackground(file);
              }
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>
        <div className="settings-module-card__actions form-field--full">
          <button
            className="button button--ghost button--danger"
            disabled={!canEdit || !backgroundAssetId}
            onClick={onClearBackground}
            type="button"
          >
            清除背景图
          </button>
        </div>
        <label className="form-field">
          <span>背景资产 ID</span>
          <input className="control-input" readOnly value={backgroundAssetId ?? "-"} />
        </label>
        <label className="form-field">
          <span>预览地址</span>
          <input className="control-input" readOnly value={backgroundImageUrl ?? "-"} />
        </label>
        <label className="form-field form-field--full">
          <span>布局元数据（JSON）</span>
          <textarea
            className="control-input control-input--textarea"
            disabled={!canEdit}
            onChange={(event) => onChangeLayoutMeta(event.target.value)}
            rows={8}
            value={layoutMetaText}
          />
        </label>
      </div>
    </aside>
  );
}

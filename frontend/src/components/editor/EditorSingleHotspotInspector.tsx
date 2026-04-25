import { DeviceListItemDto } from "../../api/types";
import { HOTSPOT_ICON_OPTIONS } from "../../utils/hotspotIcons";
import { EditorHotspotViewModel } from "../../view-models/editor";
import { HotspotIcon } from "../home/HotspotIcon";
import { EditorHotspotField } from "./editorInspectorTypes";

interface EditorSingleHotspotInspectorProps {
  canEdit: boolean;
  canMoveDown: boolean;
  canMoveUp: boolean;
  devices: DeviceListItemDto[];
  hotspot: EditorHotspotViewModel;
  isUploadingHotspotIcon: boolean;
  onChangeHotspot: (field: EditorHotspotField, value: string) => void;
  onClearHotspotIcon: () => void;
  onDeleteHotspot: () => void;
  onDuplicateHotspot: () => void;
  onMoveHotspot: (direction: "up" | "down") => void;
  onNudgeHotspot: (direction: "left" | "right" | "up" | "down") => void;
  onToggleVisibility: (visible: boolean) => void;
  onUploadHotspotIcon: (file: File) => void;
}

export function EditorSingleHotspotInspector({
  canEdit,
  canMoveDown,
  canMoveUp,
  devices,
  hotspot,
  isUploadingHotspotIcon,
  onChangeHotspot,
  onClearHotspotIcon,
  onDeleteHotspot,
  onDuplicateHotspot,
  onMoveHotspot,
  onNudgeHotspot,
  onToggleVisibility,
  onUploadHotspotIcon,
}: EditorSingleHotspotInspectorProps) {
  return (
    <div className="settings-form-grid">
      <label className="form-field">
        <span>显示名称</span>
        <input className="control-input" disabled={!canEdit} maxLength={64} onChange={(event) => onChangeHotspot("label", event.target.value)} value={hotspot.label} />
      </label>
      <label className="form-field">
        <span>绑定设备</span>
        <select className="control-input" disabled={!canEdit} onChange={(event) => onChangeHotspot("deviceId", event.target.value)} value={hotspot.deviceId}>
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
        <input className="control-input" disabled={!canEdit} onChange={(event) => onChangeHotspot("deviceId", event.target.value)} value={hotspot.deviceId} />
      </label>
      <label className="form-field">
        <span>图标类型</span>
        <select className="control-input" disabled={!canEdit} onChange={(event) => onChangeHotspot("iconType", event.target.value)} value={hotspot.iconType}>
          {HOTSPOT_ICON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
          {hotspot.iconType && !HOTSPOT_ICON_OPTIONS.some((option) => option.value === hotspot.iconType) ? (
            <option value={hotspot.iconType}>{hotspot.iconType}</option>
          ) : null}
        </select>
      </label>
      <label className="form-field">
        <span>标签模式</span>
        <select className="control-input" disabled={!canEdit} onChange={(event) => onChangeHotspot("labelMode", event.target.value)} value={hotspot.labelMode}>
          <option value="AUTO">自动</option>
          <option value="ALWAYS">始终显示</option>
          <option value="HIDDEN">隐藏</option>
        </select>
      </label>
      <div className="form-field form-field--full editor-hotspot-icon-picker">
        <span>Hotspot icon</span>
        <div className="editor-hotspot-icon-picker__preview">
          <span className="editor-hotspot-icon-picker__sample">
            <HotspotIcon iconAssetUrl={hotspot.iconAssetUrl} iconType={hotspot.iconType} />
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
          <button className="button button--ghost" disabled={!canEdit || !hotspot.iconAssetId} onClick={onClearHotspotIcon} type="button">
            Use built-in icon
          </button>
        </div>
      </div>
      <label className="form-field">
        <span>X (%)</span>
        <input className="control-input" disabled={!canEdit} max="100" min="0" onChange={(event) => onChangeHotspot("x", event.target.value)} type="number" value={Math.round(hotspot.x * 100)} />
      </label>
      <label className="form-field">
        <span>Y (%)</span>
        <input className="control-input" disabled={!canEdit} max="100" min="0" onChange={(event) => onChangeHotspot("y", event.target.value)} type="number" value={Math.round(hotspot.y * 100)} />
      </label>
      <label className="form-field">
        <span>排序</span>
        <input className="control-input" disabled={!canEdit} onChange={(event) => onChangeHotspot("structureOrder", event.target.value)} type="number" value={hotspot.structureOrder} />
      </label>
      <label className="toggle-field toggle-field--panel">
        <input checked={hotspot.isVisible} disabled={!canEdit} onChange={(event) => onToggleVisibility(event.target.checked)} type="checkbox" />
        <span>在画布中显示</span>
      </label>
      <div className="settings-module-card__actions form-field--full">
        <button className="button button--ghost" disabled={!canEdit} onClick={() => onNudgeHotspot("left")} type="button">左移 1%</button>
        <button className="button button--ghost" disabled={!canEdit} onClick={() => onNudgeHotspot("right")} type="button">右移 1%</button>
        <button className="button button--ghost" disabled={!canEdit} onClick={() => onNudgeHotspot("up")} type="button">上移 1%</button>
        <button className="button button--ghost" disabled={!canEdit} onClick={() => onNudgeHotspot("down")} type="button">下移 1%</button>
      </div>
      <div className="settings-module-card__actions form-field--full">
        <button className="button button--ghost" disabled={!canEdit} onClick={onDuplicateHotspot} type="button">复制热点</button>
        <button className="button button--ghost" disabled={!canEdit || !canMoveUp} onClick={() => onMoveHotspot("up")} type="button">上移</button>
        <button className="button button--ghost" disabled={!canEdit || !canMoveDown} onClick={() => onMoveHotspot("down")} type="button">下移</button>
        <button className="button button--ghost button--danger" disabled={!canEdit} onClick={onDeleteHotspot} type="button">删除热点</button>
      </div>
    </div>
  );
}

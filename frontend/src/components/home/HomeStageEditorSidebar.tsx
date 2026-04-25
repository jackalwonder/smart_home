import type { DeviceListItemDto } from "../../api/types";
import { HOTSPOT_ICON_OPTIONS } from "../../utils/hotspotIcons";
import type { EditorHotspotViewModel } from "../../view-models/editor";
import { HotspotIcon } from "./HotspotIcon";

interface HomeStageEditorSidebarProps {
  canEdit: boolean;
  deviceSearch: string;
  filteredUnplacedDevices: DeviceListItemDto[];
  onAddDeviceHotspot: (device: DeviceListItemDto) => void;
  onDeleteSelectedHotspot: () => void;
  onDeviceSearchChange: (value: string) => void;
  onNudgeSelectedHotspot: (direction: "left" | "right" | "up" | "down") => void;
  onSelectedHotspotFieldChange: (
    field: "label" | "iconType" | "labelMode",
    value: string,
  ) => void;
  onToggleSelectedVisibility: (visible: boolean) => void;
  selectedHotspot: EditorHotspotViewModel | null;
}

export function HomeStageEditorSidebar({
  canEdit,
  deviceSearch,
  filteredUnplacedDevices,
  onAddDeviceHotspot,
  onDeleteSelectedHotspot,
  onDeviceSearchChange,
  onNudgeSelectedHotspot,
  onSelectedHotspotFieldChange,
  onToggleSelectedVisibility,
  selectedHotspot,
}: HomeStageEditorSidebarProps) {
  return (
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
              onChange={(event) => onSelectedHotspotFieldChange("label", event.target.value)}
              value={selectedHotspot.label}
            />
          </label>
          <label className="form-field">
            <span>图标类型</span>
            <select
              className="control-input"
              disabled={!canEdit}
              onChange={(event) =>
                onSelectedHotspotFieldChange("iconType", event.target.value)
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
                onSelectedHotspotFieldChange("labelMode", event.target.value)
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
              onChange={(event) => onToggleSelectedVisibility(event.target.checked)}
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
              onClick={() => onNudgeSelectedHotspot("left")}
              type="button"
            >
              左移 1%
            </button>
            <button
              className="button button--ghost"
              disabled={!canEdit}
              onClick={() => onNudgeSelectedHotspot("right")}
              type="button"
            >
              右移 1%
            </button>
            <button
              className="button button--ghost"
              disabled={!canEdit}
              onClick={() => onNudgeSelectedHotspot("up")}
              type="button"
            >
              上移 1%
            </button>
            <button
              className="button button--ghost"
              disabled={!canEdit}
              onClick={() => onNudgeSelectedHotspot("down")}
              type="button"
            >
              下移 1%
            </button>
            <button
              className="button button--ghost button--danger"
              disabled={!canEdit}
              onClick={onDeleteSelectedHotspot}
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
            onChange={(event) => onDeviceSearchChange(event.target.value)}
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
                onClick={() => onAddDeviceHotspot(device)}
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
  );
}

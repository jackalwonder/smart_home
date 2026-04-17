import { EditorHotspotViewModel } from "../../view-models/editor";
import { DeviceListItemDto } from "../../api/types";

interface EditorToolboxProps {
  hotspots: EditorHotspotViewModel[];
  unplacedDevices: DeviceListItemDto[];
  searchValue: string;
  selectedHotspotId: string | null;
  batchSelectedHotspotIds: string[];
  canEdit: boolean;
  devicesLoading: boolean;
  onSearchChange: (value: string) => void;
  onSelectHotspot: (hotspotId: string) => void;
  onToggleBatchHotspot: (hotspotId: string) => void;
  onSelectAllHotspots: () => void;
  onClearBatchSelection: () => void;
  onAddDeviceHotspot: (device: DeviceListItemDto) => void;
}

export function EditorToolbox({
  hotspots,
  unplacedDevices,
  searchValue,
  selectedHotspotId,
  batchSelectedHotspotIds,
  canEdit,
  devicesLoading,
  onSearchChange,
  onSelectHotspot,
  onToggleBatchHotspot,
  onSelectAllHotspots,
  onClearBatchSelection,
  onAddDeviceHotspot,
}: EditorToolboxProps) {
  const batchSelectedSet = new Set(batchSelectedHotspotIds);

  return (
    <aside className="utility-card editor-toolbox">
      <span className="card-eyebrow">工具箱</span>
      <h3>热点列表</h3>
      <label className="editor-toolbox__search">
        <span>搜索</span>
        <input
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索热点或设备 ID"
          value={searchValue}
        />
      </label>
      <div className="editor-toolbox__bulk-actions">
        <span>{batchSelectedHotspotIds.length} 个已选</span>
        <button
          className="button button--ghost"
          disabled={!hotspots.length}
          onClick={onSelectAllHotspots}
          type="button"
        >
          全选当前
        </button>
        <button
          className="button button--ghost"
          disabled={!batchSelectedHotspotIds.length}
          onClick={onClearBatchSelection}
          type="button"
        >
          清空
        </button>
      </div>
      <div className="editor-toolbox__list">
        {hotspots.length ? (
          hotspots.map((hotspot) => (
            <div
              key={hotspot.id}
              className={
                hotspot.id === selectedHotspotId
                  ? "editor-toolbox__item editor-toolbox__item--selectable is-active"
                  : !hotspot.isVisible
                    ? "editor-toolbox__item editor-toolbox__item--selectable is-muted"
                    : "editor-toolbox__item editor-toolbox__item--selectable"
              }
            >
              <label className="editor-toolbox__batch-toggle">
                <input
                  checked={batchSelectedSet.has(hotspot.id)}
                  disabled={!canEdit}
                  onChange={() => onToggleBatchHotspot(hotspot.id)}
                  type="checkbox"
                />
                <span>批量</span>
              </label>
              <button
                className="editor-toolbox__item-button"
                disabled={!canEdit && hotspot.id !== selectedHotspotId}
                onClick={() => onSelectHotspot(hotspot.id)}
                type="button"
              >
                <strong>{hotspot.label}</strong>
                <span>{`#${hotspot.structureOrder} · ${hotspot.deviceId || "未绑定"}`}</span>
                <span>{`${Math.round(hotspot.x * 100)}%, ${Math.round(hotspot.y * 100)}%`}</span>
              </button>
            </div>
          ))
        ) : (
          <p className="muted-copy">当前草稿里还没有可用热点。</p>
        )}
      </div>
      <div className="editor-toolbox__section">
        <div>
          <span className="card-eyebrow">设备目录</span>
          <h4>未布点设备</h4>
        </div>
        {devicesLoading ? (
          <p className="muted-copy">正在读取设备目录...</p>
        ) : unplacedDevices.length ? (
          <div className="editor-toolbox__list">
            {unplacedDevices.map((device) => (
              <button
                key={device.device_id}
                className="editor-toolbox__item"
                disabled={!canEdit}
                onClick={() => onAddDeviceHotspot(device)}
                type="button"
              >
                <strong>{device.display_name}</strong>
                <span>{device.room_name || "未分配房间"}</span>
                <span>{device.device_id}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted-copy">设备目录中的设备都已经在草稿中布点。</p>
        )}
      </div>
    </aside>
  );
}

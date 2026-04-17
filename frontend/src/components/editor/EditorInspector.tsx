import { EditorHotspotViewModel } from "../../view-models/editor";
import { DeviceListItemDto } from "../../api/types";

interface EditorInspectorProps {
  hotspot: EditorHotspotViewModel | null;
  canEdit: boolean;
  devices: DeviceListItemDto[];
  backgroundAssetId: string | null;
  backgroundImageUrl: string | null;
  layoutMetaText: string;
  rows: Array<{ label: string; value: string }>;
  isUploadingBackground: boolean;
  onChangeHotspot: (
    field: "deviceId" | "iconType" | "labelMode" | "x" | "y" | "structureOrder",
    value: string,
  ) => void;
  onUploadBackground: (file: File) => void;
  onToggleVisibility: (visible: boolean) => void;
  onChangeLayoutMeta: (value: string) => void;
  onDeleteHotspot: () => void;
  onMoveHotspot: (direction: "up" | "down") => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function EditorInspector({
  hotspot,
  canEdit,
  devices,
  backgroundAssetId,
  backgroundImageUrl,
  layoutMetaText,
  rows,
  isUploadingBackground,
  onChangeHotspot,
  onUploadBackground,
  onToggleVisibility,
  onChangeLayoutMeta,
  onDeleteHotspot,
  onMoveHotspot,
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
      {hotspot ? (
        <div className="settings-form-grid">
          <label className="form-field">
            <span>显示名称</span>
            <input className="control-input" readOnly value={hotspot.label} />
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
            <input
              className="control-input"
              disabled={!canEdit}
              onChange={(event) => onChangeHotspot("iconType", event.target.value)}
              value={hotspot.iconType}
            />
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

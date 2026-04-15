import { EditorHotspotViewModel } from "../../view-models/editor";

interface EditorToolboxProps {
  hotspots: EditorHotspotViewModel[];
  searchValue: string;
  selectedHotspotId: string | null;
  canEdit: boolean;
  onSearchChange: (value: string) => void;
  onSelectHotspot: (hotspotId: string) => void;
}

export function EditorToolbox({
  hotspots,
  searchValue,
  selectedHotspotId,
  canEdit,
  onSearchChange,
  onSelectHotspot,
}: EditorToolboxProps) {
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
      <div className="editor-toolbox__list">
        {hotspots.length ? (
          hotspots.map((hotspot) => (
            <button
              key={hotspot.id}
              className={
                hotspot.id === selectedHotspotId
                  ? "editor-toolbox__item is-active"
                  : !hotspot.isVisible
                    ? "editor-toolbox__item is-muted"
                    : "editor-toolbox__item"
              }
              disabled={!canEdit && hotspot.id !== selectedHotspotId}
              onClick={() => onSelectHotspot(hotspot.id)}
              type="button"
            >
              <strong>{hotspot.label}</strong>
              <span>{`#${hotspot.structureOrder} · ${hotspot.deviceId || "未绑定"}`}</span>
              <span>{`${Math.round(hotspot.x * 100)}%, ${Math.round(hotspot.y * 100)}%`}</span>
            </button>
          ))
        ) : (
          <p className="muted-copy">当前草稿里还没有可用热点。</p>
        )}
      </div>
    </aside>
  );
}

import { HomeHotspotViewModel } from "../../view-models/home";

interface RoomFocusPopoverProps {
  hotspot: HomeHotspotViewModel | null;
}

export function RoomFocusPopover({ hotspot }: RoomFocusPopoverProps) {
  if (!hotspot) {
    return (
      <div className="room-focus-popover">
        <span className="card-eyebrow">焦点观察</span>
        <h3>请选择一个热点</h3>
        <p className="muted-copy">设备状态、进入方式和当前聚焦信息会显示在这里。</p>
      </div>
    );
  }

  return (
    <div className="room-focus-popover">
      <span className="card-eyebrow">{hotspot.deviceTypeLabel}</span>
      <h3>{hotspot.label}</h3>
      <div className="badge-row">
        <span className="state-chip">{hotspot.statusLabel}</span>
        <span className="state-chip">{hotspot.entryBehaviorLabel}</span>
        <span className="state-chip">
          {hotspot.isReadonly ? "只读" : hotspot.isComplex ? "面板入口" : "直接入口"}
        </span>
      </div>
      <dl className="stacked-meta">
        <div>
          <dt>状态</dt>
          <dd>{hotspot.statusLabel}</dd>
        </div>
        <div>
          <dt>进入方式</dt>
          <dd>{hotspot.entryBehaviorLabel}</dd>
        </div>
        <div>
          <dt>控制模式</dt>
          <dd>{hotspot.isReadonly ? "只读" : hotspot.isComplex ? "面板" : "直达"}</dd>
        </div>
      </dl>
      <p className="muted-copy">{hotspot.statusSummary ?? "当前没有更多状态摘要。"}</p>
    </div>
  );
}

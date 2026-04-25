import { DefaultMediaDto, DeviceListItemDto } from "../../api/types";
import { formatSettingsStatus } from "../../settings/statusFormat";
import { SettingsModuleCard } from "./SettingsModuleCard";

interface DefaultMediaPanelProps {
  availableDevices: DeviceListItemDto[];
  bindBusy: boolean;
  canEdit: boolean;
  loadingCandidates: boolean;
  media: DefaultMediaDto | null;
  message: string | null;
  selectedDeviceId: string;
  unbindBusy: boolean;
  onBind: () => void;
  onRefresh: () => void;
  onSelectDeviceId: (value: string) => void;
  onUnbind: () => void;
}

function formatValue(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

function formatDeviceType(value: string | null | undefined) {
  const normalized = (value ?? "").toLowerCase();
  const labels: Record<string, string> = {
    fridge: "冰箱",
    media: "媒体",
    media_player: "媒体播放器",
    power: "电源",
    scale: "体脂秤",
    speaker: "音箱",
    tv: "电视",
  };
  return labels[normalized] ?? (value || "媒体设备");
}

function formatPlayState(value: string | null | undefined) {
  const normalized = (value ?? "").toLowerCase();
  const labels: Record<string, string> = {
    idle: "空闲",
    off: "关闭",
    paused: "已暂停",
    playing: "播放中",
    standby: "待机",
    unavailable: "不可用",
  };
  return labels[normalized] ?? formatValue(value);
}

export function DefaultMediaPanel({
  availableDevices,
  bindBusy,
  canEdit,
  loadingCandidates,
  media,
  message,
  selectedDeviceId,
  unbindBusy,
  onBind,
  onRefresh,
  onSelectDeviceId,
  onUnbind,
}: DefaultMediaPanelProps) {
  return (
    <SettingsModuleCard
      description="指定首页默认媒体设备，并在设置页里查看当前播放态。"
      eyebrow="媒体"
      rows={[
        {
          label: "绑定状态",
          value: formatSettingsStatus(media?.binding_status ?? "MEDIA_UNSET", "media"),
        },
        { label: "当前设备", value: formatValue(media?.display_name) },
        {
          label: "可用性",
          value: formatSettingsStatus(media?.availability_status, "media"),
        },
        { label: "播放状态", value: formatPlayState(media?.play_state) },
        { label: "当前曲目", value: formatValue(media?.track_title) },
        { label: "歌手", value: formatValue(media?.artist) },
      ]}
      title="默认媒体"
    >
      <label className="form-field">
        <span>选择媒体设备</span>
        <select
          className="control-input"
          onChange={(event) => onSelectDeviceId(event.target.value)}
          value={selectedDeviceId}
        >
          <option value="">{loadingCandidates ? "正在加载设备..." : "请选择一个设备"}</option>
          {availableDevices.map((device) => (
            <option key={device.device_id} value={device.device_id}>
              {`${device.display_name} · ${formatDeviceType(device.device_type)}`}
            </option>
          ))}
        </select>
      </label>
      <div className="settings-module-card__actions">
        <button
          className="button button--ghost"
          disabled={loadingCandidates || bindBusy || unbindBusy}
          onClick={onRefresh}
          type="button"
        >
          刷新媒体状态
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || unbindBusy || bindBusy}
          onClick={onUnbind}
          type="button"
        >
          {unbindBusy ? "解绑中..." : "清除默认媒体"}
        </button>
        <button
          className="button button--primary"
          disabled={!canEdit || !selectedDeviceId || bindBusy || unbindBusy}
          onClick={onBind}
          type="button"
        >
          {bindBusy ? "保存中..." : "绑定默认媒体"}
        </button>
      </div>
      {message ? <p className="inline-success">{message}</p> : null}
    </SettingsModuleCard>
  );
}

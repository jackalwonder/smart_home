import { SgccLoginQrCodeStatusDto } from "../../api/types";
import { SettingsModuleCard } from "./SettingsModuleCard";

interface SgccLoginQrCodePanelProps {
  bindBusy: boolean;
  canBind: boolean;
  canRegenerate: boolean;
  imageUrl: string | null;
  loading: boolean;
  message: string | null;
  regenerateBusy: boolean;
  status: SgccLoginQrCodeStatusDto | null;
  onBindEnergyAccount: () => void;
  onRegenerate: () => void;
  onRefreshStatus: () => void;
}

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

function formatFileSize(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "-";
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
}

export function SgccLoginQrCodePanel({
  bindBusy,
  canBind,
  canRegenerate,
  imageUrl,
  loading,
  message,
  regenerateBusy,
  status,
  onBindEnergyAccount,
  onRegenerate,
  onRefreshStatus,
}: SgccLoginQrCodePanelProps) {
  const busy = loading || regenerateBusy || bindBusy;

  return (
    <SettingsModuleCard
      description="直接查看 sgcc_electricity 当前生成的国家电网登录二维码，扫码后等待 Home Assistant 侧生成国网传感器。"
      eyebrow="扫码登录"
      rows={[
        { label: "二维码状态", value: formatValue(status?.status) },
        { label: "文件大小", value: formatFileSize(status?.file_size_bytes) },
        { label: "更新时间", value: formatValue(status?.updated_at) },
        { label: "过期时间", value: formatValue(status?.expires_at) },
        { label: "文件类型", value: formatValue(status?.mime_type) },
      ]}
      title="国网登录二维码"
    >
      <div className="sgcc-login-qrcode">
        {imageUrl ? (
          <img
            alt="国家电网登录二维码"
            className="sgcc-login-qrcode__image"
            src={imageUrl}
          />
        ) : (
          <div className="sgcc-login-qrcode__empty">
            {status?.message ?? "等待 sgcc_electricity 生成二维码"}
          </div>
        )}
        <div className="sgcc-login-qrcode__copy">
          <p className="settings-module-card__note">
            页面会自动轮询最新二维码；如果二维码失效，点击重新生成会重启 sgcc_electricity 登录流程。
          </p>
          <p className="settings-module-card__note">
            新二维码通常需要等待密码登录重试失败后才会出现，可能需要几分钟；出现后请尽快用国家电网 App 扫码。
          </p>
        </div>
      </div>
      <div className="settings-module-card__actions">
        <button
          className="button button--ghost"
          disabled={busy}
          onClick={onRefreshStatus}
          type="button"
        >
          {loading ? "刷新中..." : "刷新状态"}
        </button>
        <button
          className="button button--primary"
          disabled={!canRegenerate || busy}
          onClick={onRegenerate}
          type="button"
        >
          {regenerateBusy ? "重新生成中..." : "重新生成二维码"}
        </button>
        <button
          className="button button--primary"
          disabled={!canBind || busy}
          onClick={onBindEnergyAccount}
          type="button"
        >
          {bindBusy ? "绑定中..." : "绑定电费账号"}
        </button>
      </div>
      {!canRegenerate || !canBind ? (
        <p className="inline-error">重新生成二维码或绑定账号前，请先验证管理 PIN。</p>
      ) : null}
      {message ? <p className="inline-error">{message}</p> : null}
      {!message && status?.message ? (
        <p className={status.available ? "inline-success" : "settings-module-card__note"}>
          {status.message}
        </p>
      ) : null}
    </SettingsModuleCard>
  );
}

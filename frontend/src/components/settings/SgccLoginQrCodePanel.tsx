import { SgccLoginQrCodeStatusDto } from "../../api/types";
import {
  formatSettingsStatus,
  getSettingsStatusTone,
} from "../../settings/statusFormat";
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

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日 ${hour}:${minute}`;
}

function formatJobState(value: string | null | undefined) {
  const normalized = (value ?? "").toUpperCase();
  const labels: Record<string, string> = {
    FAILED: "失败",
    FINISHED: "已完成",
    IDLE: "空闲",
    LOGIN_RUNNING: "登录中",
    PENDING: "等待中",
    RUNNING: "运行中",
    SUCCESS: "成功",
  };
  return labels[normalized] ?? formatValue(value);
}

function formatMimeType(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  if (value === "image/png") {
    return "PNG 图片";
  }
  if (value === "image/jpeg") {
    return "JPEG 图片";
  }
  return value;
}

function resolvePhaseDescription(status: SgccLoginQrCodeStatusDto | null) {
  const phase = status?.phase ?? status?.status ?? "UNKNOWN";
  if (phase === "DATA_READY") {
    return `已发现 ${status?.account_count ?? 0} 个账号，二维码文件状态不会覆盖整体登录/数据状态。`;
  }
  if (phase === "FETCHING_DATA") {
    return "扫码登录已经通过，sidecar 正在拉取账号和电量数据。";
  }
  if (phase === "QR_READY") {
    return "二维码可扫码，请用国家电网 App 尽快完成确认。";
  }
  if (phase === "QR_EXPIRED" || phase === "EXPIRED") {
    return "二维码文件已过期；这只代表当前图片不能继续扫码，不代表已有数据缓存失效。";
  }
  if (phase === "WAITING_FOR_SCAN") {
    return "登录流程正在等待扫码确认。";
  }
  if (phase === "LOGIN_RUNNING") {
    return "sidecar 正在运行登录任务，二维码准备后会显示在这里。";
  }
  return status?.message ?? "等待 sidecar 返回国网运行状态。";
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
  const phase = status?.phase ?? status?.status ?? "UNKNOWN";
  const phaseLabel = formatSettingsStatus(phase, "sgcc");
  const phaseTone = getSettingsStatusTone(phase, "sgcc");

  return (
    <SettingsModuleCard
      description="整体阶段优先展示登录和数据是否可用；二维码文件状态只放在扫码详情里。"
      eyebrow="扫码登录"
      title="国网登录二维码"
    >
      <div className={`sgcc-status-banner is-${phaseTone}`}>
        <div>
          <span className="card-eyebrow">当前阶段</span>
          <strong>{phaseLabel}</strong>
          <p>{resolvePhaseDescription(status)}</p>
        </div>
        <dl>
          <div>
            <dt>已发现账号</dt>
            <dd>{status?.account_count ?? 0} 个</dd>
          </div>
          <div>
            <dt>最新账号数据</dt>
            <dd>{formatTimestamp(status?.latest_account_timestamp)}</dd>
          </div>
        </dl>
      </div>

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
            页面会自动轮询最新二维码；只有需要重新扫码时，才需要重新生成二维码。
          </p>
          <p className="settings-module-card__note">
            新二维码通常需要等待密码登录重试失败后才会出现，可能需要几分钟；出现后请尽快用国家电网 App 扫码。
          </p>
        </div>
      </div>
      <details className="settings-advanced-fields">
        <summary>二维码与任务详情</summary>
        <dl className="field-grid">
          <div>
            <dt>二维码状态</dt>
            <dd>{formatSettingsStatus(status?.qr_code_status, "sgcc")}</dd>
          </div>
          <div>
            <dt>任务状态</dt>
            <dd>{formatJobState(status?.job_state)}</dd>
          </div>
          <div>
            <dt>任务阶段</dt>
            <dd>{formatSettingsStatus(status?.job_phase, "sgcc")}</dd>
          </div>
          <div>
            <dt>文件大小</dt>
            <dd>{formatFileSize(status?.file_size_bytes)}</dd>
          </div>
          <div>
            <dt>二维码更新时间</dt>
            <dd>{formatTimestamp(status?.updated_at)}</dd>
          </div>
          <div>
            <dt>二维码过期时间</dt>
            <dd>{formatTimestamp(status?.expires_at)}</dd>
          </div>
          <div>
            <dt>文件类型</dt>
            <dd>{formatMimeType(status?.mime_type)}</dd>
          </div>
          <div>
            <dt>最近错误</dt>
            <dd>{formatValue(status?.last_error)}</dd>
          </div>
        </dl>
      </details>
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
          className="button button--ghost"
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

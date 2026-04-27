import { AuditTimeline } from "../shared/AuditTimeline";
import { TokenDeliverySection } from "./TokenDeliverySection";
import { formatDateTime, formatShortId } from "../../utils/formatting";
import {
  TerminalBootstrapTokenAuditItemDto,
  TerminalBootstrapTokenCreateDto,
  TerminalBootstrapTokenDirectoryItemDto,
} from "../../api/types";
import { SettingsModuleCard } from "./SettingsModuleCard";

interface TerminalBootstrapTokenPanelProps {
  activationCode: string | null;
  activationLink: string | null;
  audits: TerminalBootstrapTokenAuditItemDto[];
  auditLoading: boolean;
  availableTerminals: TerminalBootstrapTokenDirectoryItemDto[];
  canEdit: boolean;
  createBusy: boolean;
  loading: boolean;
  message: { tone: "success" | "error"; text: string } | null;
  revealedToken: TerminalBootstrapTokenCreateDto | null;
  selectedTerminalId: string;
  status: TerminalBootstrapTokenDirectoryItemDto | null;
  onCopy: () => void;
  onCopyActivationCode: () => void;
  onCopyActivationLink: () => void;
  onCreateOrReset: () => void;
  onRefresh: () => void;
  onRefreshAudits: () => void;
  onSelectTerminalId: (value: string) => void;
}

function formatTerminalMode(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const normalized = value.toUpperCase();
  if (normalized === "ACTIVATED") {
    return "已激活";
  }
  if (normalized === "PENDING" || normalized === "UNACTIVATED") {
    return "待激活";
  }
  return value;
}

function formatAction(actionType: string, rotated: boolean | null) {
  if (actionType === "TERMINAL_BOOTSTRAP_TOKEN_RESET" || rotated) {
    return "重置";
  }
  if (actionType === "TERMINAL_BOOTSTRAP_TOKEN_CREATE") {
    return "创建";
  }
  return actionType;
}

function formatResultStatus(status: string | null | undefined) {
  if (status === "SUCCESS") {
    return "成功";
  }
  if (status === "FAILED") {
    return "失败";
  }
  return status ?? "-";
}

export function TerminalBootstrapTokenPanel({
  activationCode,
  activationLink,
  audits,
  auditLoading,
  availableTerminals,
  canEdit,
  createBusy,
  loading,
  message,
  revealedToken,
  selectedTerminalId,
  status,
  onCopy,
  onCopyActivationCode,
  onCopyActivationLink,
  onCreateOrReset,
  onRefresh,
  onRefreshAudits,
  onSelectTerminalId,
}: TerminalBootstrapTokenPanelProps) {
  const hasToken = Boolean(status?.token_configured);
  const actionLabel = hasToken ? "重置激活凭据" : "生成激活凭据";

  return (
    <SettingsModuleCard
      description="为新装、换机或重装终端生成一次性激活凭据。凭据原文只在本次生成后展示，请优先交付二维码或激活链接。"
      eyebrow="凭据交付"
      rows={[
        { label: "终端标识", value: formatShortId(status?.terminal_id) },
        { label: "终端模式", value: formatTerminalMode(status?.terminal_mode) },
        { label: "凭据状态", value: hasToken ? "已生成" : "待生成" },
        { label: "签发时间", value: formatDateTime(status?.issued_at) },
        { label: "过期时间", value: formatDateTime(status?.expires_at) },
        { label: "最近兑换", value: formatDateTime(status?.last_used_at) },
      ]}
      title="激活凭据交付"
    >
      <ol className="delivery-steps" aria-label="激活凭据交付步骤">
        <li>
          <strong>选择目标终端</strong>
          <span>先确认新装、换机或恢复的具体终端，避免发错凭据。</span>
        </li>
        <li>
          <strong>生成一次性凭据</strong>
          <span>重置后旧凭据立即失效，只保留当前这一份可交付内容。</span>
        </li>
        <li>
          <strong>按现场条件交付</strong>
          <span>优先扫码，其次激活链接，最后手动输入激活码。</span>
        </li>
      </ol>
      <label className="form-field">
        <span>目标终端</span>
        <select
          className="control-input"
          disabled={loading || createBusy}
          onChange={(event) => onSelectTerminalId(event.target.value)}
          value={selectedTerminalId}
        >
          <option value="">{loading ? "正在加载终端..." : "请选择一个终端"}</option>
          {availableTerminals.map((terminal) => (
            <option key={terminal.terminal_id} value={terminal.terminal_id}>
              {`${terminal.terminal_name} (${terminal.terminal_code})`}
            </option>
          ))}
        </select>
      </label>

      <div className="settings-module-card__actions">
        <button
          className="button button--ghost"
          disabled={!canEdit || loading || createBusy}
          onClick={onRefresh}
          type="button"
        >
          {loading ? "刷新中..." : "刷新终端状态"}
        </button>
        <button
          className="button button--primary"
          disabled={!canEdit || !selectedTerminalId || createBusy}
          onClick={onCreateOrReset}
          type="button"
        >
          {createBusy ? "处理中..." : actionLabel}
        </button>
      </div>

      {revealedToken ? (
        <TokenDeliverySection
          activationCode={activationCode}
          activationLink={activationLink}
          revealedToken={revealedToken}
          onCopy={onCopy}
          onCopyActivationCode={onCopyActivationCode}
          onCopyActivationLink={onCopyActivationLink}
        />
      ) : null}

      {message ? (
        <p className={message.tone === "error" ? "inline-error" : "inline-success"}>
          {message.text}
        </p>
      ) : null}

      <AuditTimeline
        ariaLabel="激活凭据审计"
        canEdit={canEdit}
        emptyLabel={
          auditLoading ? "正在加载激活凭据审计。" : "当前还没有激活凭据审计记录。"
        }
        items={audits}
        loading={auditLoading}
        loadingLabel="刷新中..."
        refreshLabel="刷新审计"
        sectionDescription="按时间查看最近的生成与重置动作，方便排查终端激活问题。"
        sectionTitle="最近签发记录"
        getItemKey={(audit) => audit.audit_id}
        renderItem={(audit) => (
          <>
            <div className="backup-audit__summary">
              <strong>{`${audit.terminal_name} (${audit.terminal_code})`}</strong>
              <span>{formatDateTime(audit.created_at)}</span>
            </div>
            <dl className="backup-audit__meta">
              <div>
                <dt>动作</dt>
                <dd>{formatAction(audit.action_type, audit.rotated)}</dd>
              </div>
              <div>
                <dt>操作人</dt>
                <dd>{audit.operator_name ?? audit.operator_id ?? "-"}</dd>
              </div>
              <div>
                <dt>操作终端</dt>
                <dd>{audit.acting_terminal_name ?? audit.acting_terminal_id ?? "-"}</dd>
              </div>
              <div>
                <dt>记录编号</dt>
                <dd>{formatShortId(audit.audit_id)}</dd>
              </div>
              <div>
                <dt>过期时间</dt>
                <dd>{formatDateTime(audit.expires_at)}</dd>
              </div>
              <div>
                <dt>结果</dt>
                <dd>{formatResultStatus(audit.result_status)}</dd>
              </div>
            </dl>
          </>
        )}
        onRefresh={onRefreshAudits}
      />
    </SettingsModuleCard>
  );
}

import {
  TerminalBootstrapTokenAuditItemDto,
  TerminalBootstrapTokenCreateDto,
  TerminalBootstrapTokenDirectoryItemDto,
} from "../../api/types";
import { SettingsModuleCard } from "./SettingsModuleCard";

interface TerminalBootstrapTokenPanelProps {
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
  onCreateOrReset: () => void;
  onRefresh: () => void;
  onRefreshAudits: () => void;
  onSelectTerminalId: (value: string) => void;
}

function formatValue(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
  });
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

export function TerminalBootstrapTokenPanel({
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
  onCreateOrReset,
  onRefresh,
  onRefreshAudits,
  onSelectTerminalId,
}: TerminalBootstrapTokenPanelProps) {
  const hasToken = Boolean(status?.token_configured);
  const actionLabel = hasToken ? "重置 bootstrap token" : "创建 bootstrap token";

  return (
    <SettingsModuleCard
      description="为任意终端签发或重置激活令牌，并查看最近的 bootstrap token 操作审计。令牌原文只在创建或重置当次展示。"
      eyebrow="终端激活"
      rows={[
        { label: "终端 ID", value: formatValue(status?.terminal_id) },
        { label: "终端模式", value: formatValue(status?.terminal_mode) },
        { label: "令牌状态", value: hasToken ? "已配置" : "未配置" },
        { label: "签发时间", value: formatValue(status?.issued_at) },
        { label: "过期时间", value: formatValue(status?.expires_at) },
        { label: "最近兑换", value: formatValue(status?.last_used_at) },
      ]}
      title="Bootstrap token"
    >
      <label className="form-field">
        <span>目标终端</span>
        <select
          className="control-input"
          disabled={loading || createBusy}
          onChange={(event) => onSelectTerminalId(event.target.value)}
          value={selectedTerminalId}
        >
          <option value="">
            {loading ? "正在加载终端..." : "请选择一个终端"}
          </option>
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
        <section className="bootstrap-token-reveal" aria-label="bootstrap token reveal">
          <div className="bootstrap-token-reveal__header">
            <div>
              <h4>本次签发结果</h4>
              <p className="muted-copy">
                请尽快完成终端激活。离开此页后，这里不会再次展示令牌原文。
              </p>
            </div>
            <button className="button button--ghost" onClick={onCopy} type="button">
              复制 token
            </button>
          </div>
          <textarea
            className="control-input settings-textarea"
            readOnly
            rows={4}
            value={revealedToken.bootstrap_token}
          />
          <dl className="bootstrap-token-reveal__meta">
            <div>
              <dt>过期时间</dt>
              <dd>{revealedToken.expires_at}</dd>
            </div>
            <div>
              <dt>作用域</dt>
              <dd>{revealedToken.scope.join(", ")}</dd>
            </div>
            <div>
              <dt>签发方式</dt>
              <dd>{revealedToken.rotated ? "重置" : "首次创建"}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {message ? (
        <p className={message.tone === "error" ? "inline-error" : "inline-success"}>
          {message.text}
        </p>
      ) : null}

      <section className="backup-audit" aria-label="bootstrap token 审计">
        <div className="backup-audit__header">
          <div>
            <h4>最近签发记录</h4>
            <p className="muted-copy">按时间查看最近的创建与重置动作，方便排查终端激活问题。</p>
          </div>
          <button
            className="button button--ghost"
            disabled={!canEdit || auditLoading}
            onClick={onRefreshAudits}
            type="button"
          >
            {auditLoading ? "刷新中..." : "刷新审计"}
          </button>
        </div>
        <div className="backup-audit__timeline">
          {audits.length ? (
            audits.map((audit) => (
              <article className="backup-audit__item" key={audit.audit_id}>
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
                    <dt>审计 ID</dt>
                    <dd>{audit.audit_id}</dd>
                  </div>
                  <div>
                    <dt>过期时间</dt>
                    <dd>{formatDateTime(audit.expires_at)}</dd>
                  </div>
                  <div>
                    <dt>结果</dt>
                    <dd>{audit.result_status}</dd>
                  </div>
                </dl>
              </article>
            ))
          ) : (
            <p className="backup-list__empty">
              {auditLoading ? "正在加载 bootstrap token 审计。" : "当前还没有 bootstrap token 审计记录。"}
            </p>
          )}
        </div>
      </section>
    </SettingsModuleCard>
  );
}

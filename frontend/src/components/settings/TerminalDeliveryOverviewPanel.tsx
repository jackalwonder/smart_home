import { TerminalBootstrapTokenDirectoryItemDto } from "../../api/types";

interface TerminalDeliveryOverviewPanelProps {
  availableTerminalCount: number;
  selectedTerminal: TerminalBootstrapTokenDirectoryItemDto | null;
}

function formatValue(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

export function TerminalDeliveryOverviewPanel({
  availableTerminalCount,
  selectedTerminal,
}: TerminalDeliveryOverviewPanelProps) {
  const selectedTerminalLabel = selectedTerminal
    ? `${selectedTerminal.terminal_name} (${selectedTerminal.terminal_code})`
    : "尚未选择终端";
  const credentialState = selectedTerminal?.token_configured
    ? "已准备激活凭据"
    : "待生成激活凭据";

  return (
    <section
      className="utility-card terminal-delivery-workbench"
      aria-label="终端交付现场台"
    >
      <div className="terminal-delivery-workbench__header">
        <div>
          <span className="card-eyebrow">现场交付台</span>
          <h3>终端交付现场台</h3>
          <p className="muted-copy">
            把终端交给现场人员前，先把路径和凭据对齐。新装优先用绑定码认领；换机或重装时先核对目标终端，再重新生成一次性激活凭据。
          </p>
        </div>
        <dl className="terminal-delivery-workbench__summary">
          <div>
            <dt>登记终端</dt>
            <dd>{availableTerminalCount} 台</dd>
          </div>
          <div>
            <dt>当前目标</dt>
            <dd>{selectedTerminalLabel}</dd>
          </div>
          <div>
            <dt>交付状态</dt>
            <dd>{credentialState}</dd>
          </div>
        </dl>
      </div>

      <div
        className="terminal-delivery-workbench__routes"
        aria-label="终端交付入口"
      >
        <article>
          <span>01</span>
          <strong>扫码激活</strong>
          <p>
            推荐现场使用。生成激活凭据后，让终端扫码打开链接并自动清理地址参数。
          </p>
        </article>
        <article>
          <span>02</span>
          <strong>输入激活码</strong>
          <p>无法扫码或网络受限时使用。复制激活码，在终端激活页直接粘贴。</p>
        </article>
        <article>
          <span>03</span>
          <strong>绑定码认领</strong>
          <p>新装终端显示绑定码后，在管理端认领，终端会自动完成后续激活。</p>
        </article>
      </div>

      <dl className="terminal-delivery-workbench__details">
        <div>
          <dt>终端 ID</dt>
          <dd>{formatValue(selectedTerminal?.terminal_id)}</dd>
        </div>
        <div>
          <dt>终端模式</dt>
          <dd>{formatValue(selectedTerminal?.terminal_mode)}</dd>
        </div>
        <div>
          <dt>最近生成</dt>
          <dd>{formatValue(selectedTerminal?.issued_at)}</dd>
        </div>
        <div>
          <dt>最近使用</dt>
          <dd>{formatValue(selectedTerminal?.last_used_at)}</dd>
        </div>
      </dl>
    </section>
  );
}

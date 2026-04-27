import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { TerminalBootstrapTokenCreateDto } from "../../api/types";
import { formatDateTime } from "../../utils/formatting";

interface TokenDeliverySectionProps {
  activationCode: string | null;
  activationLink: string | null;
  revealedToken: TerminalBootstrapTokenCreateDto;
  onCopy: () => void;
  onCopyActivationCode: () => void;
  onCopyActivationLink: () => void;
}

function formatScope(scope: string[]) {
  if (!scope.length) {
    return "-";
  }
  return scope
    .map((item) => {
      if (item === "terminal:activate") {
        return "终端激活";
      }
      return item;
    })
    .join("、");
}

export function TokenDeliverySection({
  activationCode,
  activationLink,
  revealedToken,
  onCopy,
  onCopyActivationCode,
  onCopyActivationLink,
}: TokenDeliverySectionProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderQrCode() {
      if (!activationLink) {
        setQrCodeDataUrl(null);
        return;
      }
      try {
        const next = await QRCode.toDataURL(activationLink, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 220,
          color: {
            dark: "#dff8ff",
            light: "#050a12",
          },
        });
        if (!cancelled) {
          setQrCodeDataUrl(next);
        }
      } catch {
        if (!cancelled) {
          setQrCodeDataUrl(null);
        }
      }
    }

    void renderQrCode();
    return () => {
      cancelled = true;
    };
  }, [activationLink]);

  return (
    <section className="bootstrap-token-reveal" aria-label="激活凭据签发结果">
      <div className="bootstrap-token-reveal__header">
        <div>
          <h4>本次签发结果</h4>
          <p className="muted-copy">
            请尽快完成终端激活。离开此页后，原始凭据不会再次展示；现场优先交付二维码或激活链接。
          </p>
        </div>
        <button className="button button--ghost" onClick={onCopy} type="button">
          复制原始凭据
        </button>
      </div>
      <label className="form-field">
        <span>原始激活凭据（仅本次可见）</span>
        <textarea
          className="control-input settings-textarea"
          readOnly
          rows={4}
          value={revealedToken.bootstrap_token}
        />
      </label>
      <dl className="bootstrap-token-reveal__meta">
        <div>
          <dt>过期时间</dt>
          <dd>{formatDateTime(revealedToken.expires_at)}</dd>
        </div>
        <div>
          <dt>作用域</dt>
          <dd>{formatScope(revealedToken.scope)}</dd>
        </div>
        <div>
          <dt>签发方式</dt>
          <dd>{revealedToken.rotated ? "重置" : "首次创建"}</dd>
        </div>
      </dl>
      <div className="bootstrap-token-delivery">
        <div className="bootstrap-token-delivery__qr">
          <span className="delivery-method-label">推荐扫码</span>
          <h4>二维码交付</h4>
          {qrCodeDataUrl ? (
            <img
              alt="终端激活二维码"
              className="bootstrap-token-delivery__qr-image"
              src={qrCodeDataUrl}
            />
          ) : (
            <div className="bootstrap-token-delivery__qr-empty">二维码生成中</div>
          )}
          <p className="muted-copy">
            现场可直接扫码打开激活链接，成功后地址栏中的激活参数会自动清除。
          </p>
        </div>
        <div className="bootstrap-token-delivery__link">
          <div>
            <span className="delivery-method-label">远程协助</span>
            <h4>激活链接</h4>
            <p className="muted-copy">
              现场浏览器可访问时使用。复制链接给现场人员打开即可完成激活。
            </p>
          </div>
          <input
            className="control-input"
            readOnly
            type="text"
            value={activationLink ?? ""}
          />
          <button
            className="button button--ghost"
            disabled={!activationLink}
            onClick={onCopyActivationLink}
            type="button"
          >
            复制激活链接
          </button>
        </div>
        <div className="bootstrap-token-delivery__code">
          <div>
            <span className="delivery-method-label">手动输入</span>
            <h4>激活码</h4>
            <p className="muted-copy">
              当终端无法扫码时，可复制下面的激活码，在激活页直接粘贴。
            </p>
          </div>
          <textarea
            className="control-input settings-textarea"
            readOnly
            rows={4}
            value={activationCode ?? ""}
          />
          <button
            className="button button--ghost"
            disabled={!activationCode}
            onClick={onCopyActivationCode}
            type="button"
          >
            复制激活码
          </button>
        </div>
      </div>
      <div className="delivery-failure-guide" aria-label="激活失败处理建议">
        <strong>现场排障提示</strong>
        <ul>
          <li>提示已过期：重新生成激活凭据，并使用最新二维码或激活码。</li>
          <li>提示无效：确认终端选择正确，旧凭据在重置后会立即失效。</li>
          <li>提示网络异常：先检查终端到管理端的网络，再重新尝试激活。</li>
        </ul>
      </div>
    </section>
  );
}

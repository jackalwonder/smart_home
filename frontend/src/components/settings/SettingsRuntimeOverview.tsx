import type { SettingsSectionViewModel } from "../../view-models/settings";
import { formatCount, type RuntimeCard } from "../../settings/runtimeOverview";

interface SettingsRuntimeOverviewProps {
  backupCount: number;
  pinActive: boolean;
  runtimeCards: RuntimeCard[];
  selectedFavoriteCount: number;
  onSelectSection: (nextSection: SettingsSectionViewModel["key"], targetId?: string) => void;
}

export function SettingsRuntimeOverview({
  backupCount,
  pinActive,
  runtimeCards,
  selectedFavoriteCount,
  onSelectSection,
}: SettingsRuntimeOverviewProps) {
  return (
    <section className="settings-runtime-overview" aria-label="运行总览">
      <section className="settings-runtime-hero">
        <div>
          <span className="card-eyebrow">运行总览</span>
          <h3>先处理异常，再进入配置</h3>
          <p className="muted-copy">
            这里只展示真实状态和下一步动作。说明文案、低频字段和高级配置都收进对应任务区。
          </p>
        </div>
        <dl className="settings-runtime-hero__stats">
          <div>
            <dt>PIN</dt>
            <dd>{pinActive ? "已验证" : "待验证"}</dd>
          </div>
          <div>
            <dt>首页常用</dt>
            <dd>{formatCount(selectedFavoriteCount, "个")}</dd>
          </div>
          <div>
            <dt>备份</dt>
            <dd>{formatCount(backupCount, "条")}</dd>
          </div>
        </dl>
      </section>

      <div className="settings-runtime-grid">
        {runtimeCards.map((card) => (
          <article className="settings-runtime-card" key={card.key}>
            <div className="settings-runtime-card__header">
              <div>
                <span className="card-eyebrow">{card.label}</span>
                <strong>{card.status}</strong>
              </div>
              <span className={`settings-status-dot is-${card.tone}`} aria-hidden />
            </div>
            <p>{card.description}</p>
            <button
              className="button button--ghost"
              onClick={() => onSelectSection(card.section, card.targetId)}
              type="button"
            >
              {card.actionLabel}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

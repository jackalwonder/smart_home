interface SettingsHeaderBarProps {
  title: string;
  description: string;
  version: string;
  status: string;
}

function formatSettingsVersion(value: string) {
  const match = value.match(/(\d{8})(\d{6})/);
  if (!match) {
    return value || "-";
  }
  const [, date, time] = match;
  return `${Number(date.slice(4, 6))}月${Number(date.slice(6, 8))}日 ${time.slice(0, 2)}:${time.slice(2, 4)}`;
}

export function SettingsHeaderBar({
  title,
  description,
  version,
  status,
}: SettingsHeaderBarProps) {
  const statusLabel =
    status === "loading"
      ? "加载中"
      : status === "error"
        ? "异常"
        : status === "success"
          ? "已就绪"
          : "待机";

  return (
    <header className="panel settings-header-bar">
      <div>
        <span className="card-eyebrow">配置中心</span>
        <h2>{title}</h2>
        <p className="muted-copy">{description}</p>
      </div>
      <div className="badge-row">
        <span className="state-chip">{statusLabel}</span>
        <span className="state-chip">配置 {formatSettingsVersion(version)}</span>
      </div>
    </header>
  );
}

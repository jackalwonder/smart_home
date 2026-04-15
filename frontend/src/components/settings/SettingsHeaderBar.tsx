interface SettingsHeaderBarProps {
  title: string;
  description: string;
  version: string;
  status: string;
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
        <span className="state-chip">版本 {version}</span>
      </div>
    </header>
  );
}

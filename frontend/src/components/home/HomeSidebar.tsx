interface HomeSidebarProps {
  sidebar: Record<string, unknown> | null;
  energyBar: Record<string, unknown> | null;
}

export function HomeSidebar({ sidebar, energyBar }: HomeSidebarProps) {
  const summary = (sidebar?.summary as Record<string, unknown> | undefined) ?? null;
  const musicCard = (sidebar?.music_card as Record<string, unknown> | undefined) ?? null;

  return (
    <section className="card home-sidebar">
      <div className="card__header">
        <div>
          <span className="card__eyebrow">Sidebar</span>
          <h3>右侧信息栏</h3>
        </div>
      </div>
      <div className="metric-grid">
        <article className="metric-card">
          <span>在线设备</span>
          <strong>{String(summary?.online_count ?? "-")}</strong>
        </article>
        <article className="metric-card">
          <span>离线设备</span>
          <strong>{String(summary?.offline_count ?? "-")}</strong>
        </article>
        <article className="metric-card">
          <span>开灯数</span>
          <strong>{String(summary?.lights_on_count ?? "-")}</strong>
        </article>
        <article className="metric-card">
          <span>低电量</span>
          <strong>{String(summary?.low_battery_count ?? "-")}</strong>
        </article>
      </div>
      <div className="home-sidebar__module">
        <h4>默认媒体卡片</h4>
        <p>绑定态：{String(musicCard?.binding_status ?? "-")}</p>
        <p>可用态：{String(musicCard?.availability_status ?? "-")}</p>
        <p>设备：{String(musicCard?.display_name ?? "-")}</p>
        <p>状态：{String(musicCard?.play_state ?? "-")}</p>
      </div>
      <div className="home-sidebar__module">
        <h4>电量条</h4>
        <p>绑定态：{String(energyBar?.binding_status ?? "-")}</p>
        <p>刷新态：{String(energyBar?.refresh_status ?? "-")}</p>
        <p>月用量：{String(energyBar?.monthly_usage ?? "-")}</p>
        <p>余额：{String(energyBar?.balance ?? "-")}</p>
      </div>
    </section>
  );
}

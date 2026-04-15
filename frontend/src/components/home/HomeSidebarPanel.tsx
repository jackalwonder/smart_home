interface HomeSidebarPanelProps {
  sidebar: Record<string, unknown> | null;
  energyBar: Record<string, unknown> | null;
}

export function HomeSidebarPanel({ sidebar, energyBar }: HomeSidebarPanelProps) {
  const summary = (sidebar?.summary as Record<string, unknown> | undefined) ?? null;
  const musicCard = (sidebar?.music_card as Record<string, unknown> | undefined) ?? null;

  return (
    <section className="card home-sidebar">
      <div className="card__header">
        <div>
          <span className="card__eyebrow">Sidebar</span>
          <h3>Live summary</h3>
        </div>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <span>Online</span>
          <strong>{String(summary?.online_count ?? "-")}</strong>
        </article>
        <article className="metric-card">
          <span>Offline</span>
          <strong>{String(summary?.offline_count ?? "-")}</strong>
        </article>
        <article className="metric-card">
          <span>Lights on</span>
          <strong>{String(summary?.lights_on_count ?? "-")}</strong>
        </article>
        <article className="metric-card">
          <span>Low battery</span>
          <strong>{String(summary?.low_battery_count ?? "-")}</strong>
        </article>
      </div>

      <div className="home-sidebar__module">
        <h4>Default media card</h4>
        <p>binding: {String(musicCard?.binding_status ?? "-")}</p>
        <p>availability: {String(musicCard?.availability_status ?? "-")}</p>
        <p>device: {String(musicCard?.display_name ?? "-")}</p>
        <p>play_state: {String(musicCard?.play_state ?? "-")}</p>
      </div>

      <div className="home-sidebar__module">
        <h4>Energy bar</h4>
        <p>binding: {String(energyBar?.binding_status ?? "-")}</p>
        <p>refresh: {String(energyBar?.refresh_status ?? "-")}</p>
        <p>monthly_usage: {String(energyBar?.monthly_usage ?? "-")}</p>
        <p>balance: {String(energyBar?.balance ?? "-")}</p>
      </div>
    </section>
  );
}

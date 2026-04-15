interface FloorplanStagePanelProps {
  stage: Record<string, unknown> | null;
}

export function FloorplanStagePanel({ stage }: FloorplanStagePanelProps) {
  const hotspots = (stage?.hotspots as Array<Record<string, unknown>> | undefined) ?? [];
  const backgroundImageUrl = (stage?.background_image_url as string | null | undefined) ?? null;

  return (
    <section className="card floorplan-stage">
      <div className="card__header">
        <div>
          <span className="card__eyebrow">Stage</span>
          <h3>Floorplan stage</h3>
        </div>
        <span className="status-pill">hotspots {hotspots.length}</span>
      </div>

      <div className="floorplan-stage__canvas">
        {backgroundImageUrl ? (
          <img alt="Floorplan" className="floorplan-stage__image" src={backgroundImageUrl} />
        ) : (
          <div className="floorplan-stage__placeholder">
            No floorplan image is published yet. Live hotspot coordinates will appear here.
          </div>
        )}

        <div className="floorplan-stage__hotspots">
          {hotspots.map((hotspot, index) => {
            const x = Number(hotspot.x ?? 0) * 100;
            const y = Number(hotspot.y ?? 0) * 100;

            return (
              <div
                key={String(hotspot.hotspot_id ?? `overview-hotspot-${index}`)}
                className="floorplan-stage__hotspot"
                style={{ left: `${x}%`, top: `${y}%` }}
                title={String(hotspot.display_name ?? hotspot.device_id ?? "device")}
              >
                <span>{String(hotspot.display_name ?? hotspot.device_id ?? "device")}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

interface FloorplanStageProps {
  stage: Record<string, unknown> | null;
}

export function FloorplanStage({ stage }: FloorplanStageProps) {
  const hotspots = (stage?.hotspots as Array<Record<string, unknown>> | undefined) ?? [];
  const backgroundImageUrl = (stage?.background_image_url as string | null | undefined) ?? null;

  return (
    <section className="card floorplan-stage">
      <div className="card__header">
        <div>
          <span className="card__eyebrow">Stage</span>
          <h3>主舞台</h3>
        </div>
        <span className="status-pill">hotspots {hotspots.length}</span>
      </div>
      <div className="floorplan-stage__canvas">
        {backgroundImageUrl ? (
          <img
            className="floorplan-stage__image"
            src={backgroundImageUrl}
            alt="户型底图"
          />
        ) : (
          <div className="floorplan-stage__placeholder">等待底图或正式快照</div>
        )}
        <div className="floorplan-stage__hotspots">
          {hotspots.map((hotspot) => {
            const x = Number(hotspot.x ?? 0) * 100;
            const y = Number(hotspot.y ?? 0) * 100;
            return (
              <div
                key={String(hotspot.hotspot_id)}
                className="floorplan-stage__hotspot"
                style={{ left: `${x}%`, top: `${y}%` }}
                title={String(hotspot.display_name ?? hotspot.device_id)}
              >
                <span>{String(hotspot.display_name ?? "设备")}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import { HomeMetricViewModel } from "../../view-models/home";

interface BottomStatsStripProps {
  stats: HomeMetricViewModel[];
}

export function BottomStatsStrip({ stats }: BottomStatsStripProps) {
  return (
    <section className="bottom-stats-strip bottom-energy-band">
      {stats.map((stat) => (
        <article key={stat.label} className="bottom-energy-band__item">
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
        </article>
      ))}
    </section>
  );
}

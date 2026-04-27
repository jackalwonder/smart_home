import { Link } from "react-router-dom";
import { HomeMediaSource } from "./homeInsightRailModel";

export function HomeMediaPlayerSlide({ source }: { source: HomeMediaSource }) {
  return (
    <article className="home-media-player">
      <div className="home-media-player__cover">
        <span>{source.glyph}</span>
      </div>
      <div className="home-media-player__copy">
        <span>{source.source}</span>
        <strong>{source.title}</strong>
        <small>{source.subtitle}</small>
      </div>
      {source.isPlaceholder ? (
        <Link className="home-media-player__settings-link" to="/settings?section=integrations">
          配置媒体
        </Link>
      ) : (
        <div className="home-media-player__controls">
          <button aria-label="上一源" type="button">
            ‹
          </button>
          <button
            aria-label={source.state === "播放中" ? "暂停" : "播放"}
            className="is-primary"
            type="button"
          >
            {source.state === "播放中" ? "Ⅱ" : "▶"}
          </button>
          <button aria-label="下一源" type="button">
            ›
          </button>
        </div>
      )}
    </article>
  );
}

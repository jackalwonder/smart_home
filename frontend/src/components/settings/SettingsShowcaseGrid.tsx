import { useState } from "react";

const showcaseItems: Array<{
  key: string;
  title: string;
  subtitle: string;
  meta: string;
  glyph: string;
}> = [
  {
    key: "lighting",
    title: "智能灯光",
    subtitle: "Lighting Entity",
    meta: "灯光实体配置",
    glyph: "灯",
  },
  {
    key: "climate",
    title: "空调温控",
    subtitle: "Climate Control",
    meta: "温控策略配置",
    glyph: "温",
  },
  {
    key: "switch",
    title: "开关插座",
    subtitle: "Switch & Plug",
    meta: "开关能力配置",
    glyph: "关",
  },
  {
    key: "sensor",
    title: "环境传感",
    subtitle: "Sensor Group",
    meta: "状态阈值配置",
    glyph: "感",
  },
  {
    key: "other",
    title: "其它实体追踪",
    subtitle: "Entity Tracking",
    meta: "设备目录与页面策略",
    glyph: "实",
  },
];

export function SettingsShowcaseGrid() {
  const [activeCategory, setActiveCategory] = useState(showcaseItems[0].key);

  return (
    <section className="settings-showcase-grid" aria-label="常用设备分类">
      {showcaseItems.map((item) => (
        <button
          className={
            item.key === activeCategory
              ? "settings-showcase-card is-active"
              : "settings-showcase-card"
          }
          key={item.key}
          onClick={() => setActiveCategory(item.key)}
          type="button"
        >
          <span className="settings-showcase-card__glyph">{item.glyph}</span>
          <span className="settings-showcase-card__copy">
            <strong>{item.title}</strong>
            <small>{item.subtitle}</small>
            <em>{item.meta}</em>
          </span>
          <span className="settings-showcase-card__cta">点击配置</span>
        </button>
      ))}
    </section>
  );
}

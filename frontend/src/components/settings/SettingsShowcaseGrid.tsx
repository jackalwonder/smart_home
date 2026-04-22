import { useState } from "react";

const showcaseItems: Array<{
  key: string;
  title: string;
  subtitle: string;
  meta: string;
  glyph: string;
}> = [
  {
    key: "home-favorites",
    title: "首页常用设备",
    subtitle: "Home Favorites",
    meta: "排序、启停和移出首页",
    glyph: "常",
  },
  {
    key: "quick-entry",
    title: "首页快捷入口",
    subtitle: "Quick Entries",
    meta: "常用、场景、媒体、能耗",
    glyph: "快",
  },
  {
    key: "display-rules",
    title: "首页显示规则",
    subtitle: "Display Rules",
    meta: "上限、自动返回和展示策略",
    glyph: "规",
  },
  {
    key: "device-source",
    title: "设备页添加入口",
    subtitle: "Device Center",
    meta: "浏览设备并选择加入首页",
    glyph: "设",
  },
  {
    key: "floorplan",
    title: "户型图热点",
    subtitle: "Floorplan Hotspots",
    meta: "通过总览轻编辑与设置高级治理完成发布",
    glyph: "图",
  },
];

export function SettingsShowcaseGrid() {
  const [activeCategory, setActiveCategory] = useState(showcaseItems[0].key);

  return (
    <section className="settings-showcase-grid" aria-label="首页入口管理分类">
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

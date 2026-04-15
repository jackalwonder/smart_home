import { SettingsSectionViewModel } from "../../view-models/settings";

interface SettingsSideNavProps {
  sections: SettingsSectionViewModel[];
  activeSection: SettingsSectionViewModel["key"];
  onSelectSection: (key: SettingsSectionViewModel["key"]) => void;
}

export function SettingsSideNav({
  sections,
  activeSection,
  onSelectSection,
}: SettingsSideNavProps) {
  return (
    <nav className="settings-side-nav" aria-label="设置分区">
      <span className="card-eyebrow">设置</span>
      {sections.map((section) => (
        <button
          key={section.key}
          className={
            section.key === activeSection
              ? "settings-side-nav__item is-active"
              : "settings-side-nav__item"
          }
          onClick={() => onSelectSection(section.key)}
          type="button"
        >
          <strong>{section.label}</strong>
          <span>{section.eyebrow}</span>
        </button>
      ))}
    </nav>
  );
}

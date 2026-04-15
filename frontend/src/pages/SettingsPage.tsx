import { useEffect, useState } from "react";
import { SettingsPanel } from "../components/settings/SettingsPanel";
import { fetchSettings } from "../api/settingsApi";
import { normalizeApiError } from "../api/httpClient";
import { appStore, useAppStore } from "../store/useAppStore";

const tabs = [
  { key: "favorites", label: "常用设备" },
  { key: "system", label: "系统设置" },
  { key: "page", label: "页面设置" },
  { key: "function", label: "功能设置" },
];

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const [activeTab, setActiveTab] = useState("favorites");

  useEffect(() => {
    let active = true;

    void (async () => {
      appStore.setSettingsLoading();
      try {
        const data = await fetchSettings();
        if (!active) {
          return;
        }
        appStore.setSettingsData(data as unknown as Record<string, unknown>);
      } catch (error) {
        if (!active) {
          return;
        }
        appStore.setSettingsError(normalizeApiError(error).message);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const settingsData = settings.data as
    | {
        settings_version?: string;
        pin_session_required?: boolean;
        favorites?: Record<string, unknown>;
        page_settings?: Record<string, unknown>;
        function_settings?: Record<string, unknown>;
        system_settings_summary?: Record<string, unknown>;
      }
    | null;

  const panels: Record<string, Record<string, unknown> | null> = {
    favorites: settingsData?.favorites ?? null,
    system: settingsData?.system_settings_summary ?? null,
    page: settingsData?.page_settings ?? null,
    function: settingsData?.function_settings ?? null,
  };

  return (
    <section className="page">
      <header className="page__header">
        <div>
          <span className="page__eyebrow">Settings</span>
          <h2>设置中心</h2>
          <p>第一版先把 Save All 管辖范围和 4 个配置域装入同一个工作台。</p>
        </div>
        <div className="page__badge-row">
          <span className="status-pill">{settings.status}</span>
          <span className="status-pill">
            settings_version: {settingsData?.settings_version ?? "-"}
          </span>
        </div>
      </header>

      <div className="tab-bar">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={tab.key === activeTab ? "tab-bar__item is-active" : "tab-bar__item"}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <SettingsPanel
        title={tabs.find((tab) => tab.key === activeTab)?.label ?? ""}
        description="这里先承接冻结接口快照，后续再补真实表单与 Save All 草稿层。"
        payload={panels[activeTab]}
      />

      {settingsData?.pin_session_required ? (
        <p className="page__hint">当前配置域要求管理态 PIN 会话。</p>
      ) : null}
      {settings.error ? <p className="page__error">{settings.error}</p> : null}
    </section>
  );
}

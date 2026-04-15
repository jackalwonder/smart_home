import { useEffect, useMemo, useState } from "react";
import { SettingsPanel } from "../components/settings/SettingsPanel";
import { fetchSettings, saveSettings } from "../api/settingsApi";
import { normalizeApiError } from "../api/httpClient";
import { appStore, useAppStore } from "../store/useAppStore";

const tabs = [
  { key: "favorites", label: "Favorites" },
  { key: "system", label: "System" },
  { key: "page", label: "Page" },
  { key: "function", label: "Function" },
];

interface SettingsViewModel {
  settings_version: string | null;
  pin_session_required?: boolean;
  favorites?: Array<Record<string, unknown>>;
  page_settings?: Record<string, unknown>;
  function_settings?: Record<string, unknown>;
  system_settings_summary?: Record<string, unknown>;
}

export function SettingsWorkspacePage() {
  const session = useAppStore((state) => state.session);
  const settings = useAppStore((state) => state.settings);
  const [activeTab, setActiveTab] = useState("favorites");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function loadSettings() {
    appStore.setSettingsLoading();
    try {
      const data = await fetchSettings();
      appStore.setSettingsData(data as unknown as Record<string, unknown>);
    } catch (error) {
      appStore.setSettingsError(normalizeApiError(error).message);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  const settingsData = (settings.data as SettingsViewModel | null) ?? null;
  const activePayload = useMemo(() => {
    if (!settingsData) {
      return null;
    }

    const panels: Record<string, unknown> = {
      favorites: settingsData.favorites ?? [],
      system: settingsData.system_settings_summary ?? null,
      page: settingsData.page_settings ?? null,
      function: settingsData.function_settings ?? null,
    };

    return panels[activeTab] ?? null;
  }, [activeTab, settingsData]);

  const canSave =
    Boolean(session.data?.terminalId) &&
    Boolean(session.data?.pinSessionActive) &&
    Boolean(settingsData);

  async function handleSave() {
    if (!settingsData || !session.data?.terminalId) {
      return;
    }

    setSaveMessage(null);
    setIsSaving(true);
    try {
      const response = await saveSettings({
        settings_version: settingsData.settings_version ?? null,
        page_settings: settingsData.page_settings ?? {},
        function_settings: settingsData.function_settings ?? {},
        favorites: settingsData.favorites ?? [],
        terminal_id: session.data.terminalId,
      });
      setSaveMessage(`Saved. settings_version is now ${response.settings_version}.`);
      await loadSettings();
    } catch (error) {
      appStore.setSettingsError(normalizeApiError(error).message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="page">
      <header className="page__header">
        <div>
          <span className="page__eyebrow">Settings</span>
          <h2>Settings workspace</h2>
          <p>Real settings snapshot is loaded from backend. Save All now calls the frozen API.</p>
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
        canSave={canSave}
        description="Read uses the real frozen query API. Save All sends the current page, function, and favorites payloads back to the backend."
        onSave={() => void handleSave()}
        payload={activePayload}
        saving={isSaving}
        title={tabs.find((tab) => tab.key === activeTab)?.label ?? ""}
      />

      {!session.data?.pinSessionActive ? (
        <p className="page__hint">
          Management PIN is required before Save All can write settings.
        </p>
      ) : null}
      {saveMessage ? <p className="page__success">{saveMessage}</p> : null}
      {settings.error ? <p className="page__error">{settings.error}</p> : null}
    </section>
  );
}

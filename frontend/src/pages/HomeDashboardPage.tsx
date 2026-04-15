import { useEffect } from "react";
import { fetchHomeOverview } from "../api/homeApi";
import { normalizeApiError } from "../api/httpClient";
import { FloorplanStagePanel } from "../components/home/FloorplanStagePanel";
import { HomeQuickEntriesPanel } from "../components/home/HomeQuickEntriesPanel";
import { HomeSidebarPanel } from "../components/home/HomeSidebarPanel";
import { appStore, useAppStore } from "../store/useAppStore";

interface HomeOverviewView {
  stage?: Record<string, unknown>;
  sidebar?: Record<string, unknown>;
  quick_entries?: Array<Record<string, unknown>>;
  energy_bar?: Record<string, unknown>;
  cache_mode?: boolean;
}

export function HomeDashboardPage() {
  const home = useAppStore((state) => state.home);

  useEffect(() => {
    let active = true;

    void (async () => {
      appStore.setHomeLoading();
      try {
        const data = await fetchHomeOverview();
        if (!active) {
          return;
        }
        appStore.setHomeData(data as unknown as Record<string, unknown>);
      } catch (error) {
        if (!active) {
          return;
        }
        appStore.setHomeError(normalizeApiError(error).message);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const overview = (home.data as HomeOverviewView | null) ?? null;

  return (
    <section className="page page--home">
      <header className="page__header">
        <div>
          <span className="page__eyebrow">Home Overview</span>
          <h2>Home workspace</h2>
          <p>Stage, sidebar, quick entries, and energy rail are now reading the live overview API.</p>
        </div>
        <div className="page__badge-row">
          <span className="status-pill">{home.status}</span>
          <span className="status-pill">
            {overview?.cache_mode ? "cache_mode" : "live_mode"}
          </span>
        </div>
      </header>

      <div className="home-layout">
        <FloorplanStagePanel stage={overview?.stage ?? null} />
        <div className="home-layout__rail">
          <HomeSidebarPanel
            sidebar={overview?.sidebar ?? null}
            energyBar={overview?.energy_bar ?? null}
          />
          <HomeQuickEntriesPanel entries={overview?.quick_entries ?? []} />
        </div>
      </div>

      {home.error ? <p className="page__error">{home.error}</p> : null}
    </section>
  );
}

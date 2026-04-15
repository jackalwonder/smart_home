import { useEffect } from "react";
import { fetchHomeOverview } from "../api/homeApi";
import { normalizeApiError } from "../api/httpClient";
import { FloorplanStage } from "../components/home/FloorplanStage";
import { HomeQuickEntries } from "../components/home/HomeQuickEntries";
import { HomeSidebar } from "../components/home/HomeSidebar";
import { appStore, useAppStore } from "../store/useAppStore";

export function HomePage() {
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

  const overview = home.data as
    | {
        stage?: Record<string, unknown>;
        sidebar?: Record<string, unknown>;
        quick_entries?: Array<Record<string, unknown>>;
        energy_bar?: Record<string, unknown>;
        cache_mode?: boolean;
      }
    | null;

  return (
    <section className="page page--home">
      <header className="page__header">
        <div>
          <span className="page__eyebrow">Home Overview</span>
          <h2>首页工作台</h2>
          <p>按冻结契约承接主舞台、信息栏、快捷入口和电量条。</p>
        </div>
        <div className="page__badge-row">
          <span className="status-pill">{home.status}</span>
          <span className="status-pill">
            {overview?.cache_mode ? "cache_mode" : "live_mode"}
          </span>
        </div>
      </header>
      <div className="home-layout">
        <FloorplanStage stage={overview?.stage ?? null} />
        <div className="home-layout__rail">
          <HomeSidebar
            sidebar={overview?.sidebar ?? null}
            energyBar={overview?.energy_bar ?? null}
          />
          <HomeQuickEntries entries={overview?.quick_entries ?? []} />
        </div>
      </div>
      {home.error ? <p className="page__error">{home.error}</p> : null}
    </section>
  );
}

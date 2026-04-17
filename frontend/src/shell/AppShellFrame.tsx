import { Outlet } from "react-router-dom";
import { ControlTopBar } from "../components/layout/ControlTopBar";
import { RealtimeNoticeBar } from "../components/layout/RealtimeNoticeBar";
import { AppBootstrap } from "../system/AppBootstrap";

export function AppShellFrame() {
  return (
    <AppBootstrap>
      <div className="control-shell">
        <ControlTopBar />
        <RealtimeNoticeBar />
        <main className="control-shell__content">
          <Outlet />
        </main>
      </div>
    </AppBootstrap>
  );
}

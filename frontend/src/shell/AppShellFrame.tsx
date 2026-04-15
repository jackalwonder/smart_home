import { Outlet } from "react-router-dom";
import { ControlTopBar } from "../components/layout/ControlTopBar";
import { AppBootstrap } from "../system/AppBootstrap";

export function AppShellFrame() {
  return (
    <AppBootstrap>
      <div className="control-shell">
        <ControlTopBar />
        <main className="control-shell__content">
          <Outlet />
        </main>
      </div>
    </AppBootstrap>
  );
}

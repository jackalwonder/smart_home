import { NavLink, Outlet } from "react-router-dom";
import { PinAccessCard } from "../components/auth/PinAccessCard";
import { useAppStore } from "../store/useAppStore";
import { AppBootstrap } from "../system/AppBootstrap";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/settings", label: "Settings" },
  { to: "/editor", label: "Editor" },
];

export function AppShellFrame() {
  const session = useAppStore((state) => state.session);
  const realtime = useAppStore((state) => state.realtime);

  return (
    <AppBootstrap>
      <div className="app-shell">
        <aside className="app-shell__sidebar">
          <div className="app-shell__brand">
            <span className="app-shell__eyebrow">Frozen v2.4</span>
            <h1>Smart Home Console</h1>
            <p>Frontend delivery workspace</p>
          </div>

          <nav className="app-shell__nav">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  isActive ? "app-shell__nav-link is-active" : "app-shell__nav-link"
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <section className="app-shell__status-card">
            <h2>Session</h2>
            <dl>
              <div>
                <dt>home_id</dt>
                <dd>{session.data?.homeId ?? "-"}</dd>
              </div>
              <div>
                <dt>terminal_id</dt>
                <dd>{session.data?.terminalId ?? "-"}</dd>
              </div>
              <div>
                <dt>PIN</dt>
                <dd>{session.data?.pinSessionActive ? "Verified" : "Pending"}</dd>
              </div>
            </dl>
          </section>

          <section className="app-shell__status-card">
            <h2>Realtime</h2>
            <dl>
              <div>
                <dt>connection</dt>
                <dd>{realtime.connectionStatus}</dd>
              </div>
              <div>
                <dt>sequence</dt>
                <dd>{realtime.lastSequence ?? "-"}</dd>
              </div>
              <div>
                <dt>event</dt>
                <dd>{realtime.lastEventType ?? "-"}</dd>
              </div>
            </dl>
          </section>

          <PinAccessCard />
        </aside>

        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </AppBootstrap>
  );
}

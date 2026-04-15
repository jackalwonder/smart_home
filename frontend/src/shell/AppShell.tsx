import { NavLink, Outlet } from "react-router-dom";
import { PinAccessCard } from "../components/auth/PinAccessCard";
import { useAppStore } from "../store/useAppStore";
import { AppBootstrap } from "../system/AppBootstrap";

const navItems = [
  { to: "/", label: "首页" },
  { to: "/settings", label: "设置中心" },
  { to: "/editor", label: "编辑态" },
];

export function AppShell() {
  const session = useAppStore((state) => state.session);
  const realtime = useAppStore((state) => state.realtime);

  return (
    <AppBootstrap>
      <div className="app-shell">
        <aside className="app-shell__sidebar">
          <div className="app-shell__brand">
            <span className="app-shell__eyebrow">Frozen v2.4</span>
            <h1>家庭智能中控</h1>
            <p>前端实施骨架</p>
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
            <h2>会话</h2>
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
                <dd>{session.data?.pinSessionActive ? "已验证" : "待验证"}</dd>
              </div>
            </dl>
          </section>
          <section className="app-shell__status-card">
            <h2>实时链路</h2>
            <dl>
              <div>
                <dt>连接</dt>
                <dd>{realtime.connectionStatus}</dd>
              </div>
              <div>
                <dt>sequence</dt>
                <dd>{realtime.lastSequence ?? "-"}</dd>
              </div>
              <div>
                <dt>事件</dt>
                <dd>{realtime.lastEventType ?? "-"}</dd>
              </div>
            </dl>
          </section>
        </aside>
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </AppBootstrap>
  );
}

import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "总览", end: true },
  { to: "/settings", label: "设置", end: false },
  { to: "/editor", label: "编辑", end: false },
];

export function TopNavTabs() {
  return (
    <nav className="top-nav-tabs" aria-label="Primary">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          className={({ isActive }) =>
            isActive ? "top-nav-tabs__link is-active" : "top-nav-tabs__link"
          }
          end={item.end}
          to={item.to}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

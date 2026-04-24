import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { NotFoundPage } from "./pages/NotFoundPage";
import { AppShellFrame } from "./shell/AppShellFrame";

const HomeDashboardPage = lazy(() =>
  import("./pages/HomeDashboardPage").then((module) => ({
    default: module.HomeDashboardPage,
  })),
);
const SettingsWorkspacePage = lazy(() =>
  import("./pages/SettingsWorkspacePage").then((module) => ({
    default: module.SettingsWorkspacePage,
  })),
);
const DevicesCatalogPage = lazy(() =>
  import("./pages/DevicesCatalogPage").then((module) => ({
    default: module.DevicesCatalogPage,
  })),
);

function RouteSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="page-shell">
          <div className="utility-card" role="status">
            页面加载中...
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShellFrame />,
    children: [
      {
        index: true,
        element: (
          <RouteSuspense>
            <HomeDashboardPage />
          </RouteSuspense>
        ),
      },
      {
        path: "settings",
        element: (
          <RouteSuspense>
            <SettingsWorkspacePage />
          </RouteSuspense>
        ),
      },
      {
        path: "devices",
        element: (
          <RouteSuspense>
            <DevicesCatalogPage />
          </RouteSuspense>
        ),
      },
      {
        path: "editor",
        element: <Navigate replace to="/settings?section=home" />,
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

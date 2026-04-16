import { createBrowserRouter } from "react-router-dom";
import { DevicesCatalogPage } from "./pages/DevicesCatalogPage";
import { EditorWorkbenchWorkspace } from "./pages/EditorWorkbenchWorkspace";
import { HomeDashboardPage } from "./pages/HomeDashboardPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SettingsWorkspacePage } from "./pages/SettingsWorkspacePage";
import { AppShellFrame } from "./shell/AppShellFrame";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShellFrame />,
    children: [
      {
        index: true,
        element: <HomeDashboardPage />,
      },
      {
        path: "settings",
        element: <SettingsWorkspacePage />,
      },
      {
        path: "devices",
        element: <DevicesCatalogPage />,
      },
      {
        path: "editor",
        element: <EditorWorkbenchWorkspace />,
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

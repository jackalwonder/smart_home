import { expect, test } from "@playwright/test";
import {
  installSmokeBootstrapHook,
  bootstrapSession,
  openRealtimeProbe,
  expectEnvelope,
  saveCurrentSettingsSnapshot,
  unlockManagementPin,
  ensureSecondaryTerminal,
  SECONDARY_TERMINAL_ID,
  forceRealtimeDisconnect,
  formatSettingsVersion,
  type SettingsSnapshot,
} from "./support/smokeHelpers";

installSmokeBootstrapHook();

test("settings save emits realtime settings_updated event", async ({ page, request }) => {
  const session = await bootstrapSession(request);
  await openRealtimeProbe(page, session.access_token);

  const settings = await expectEnvelope<SettingsSnapshot>(
    await request.get("/api/v1/settings", {
      headers: { authorization: `Bearer ${session.access_token}` },
    }),
  );
  const saved = await saveCurrentSettingsSnapshot(request, session.access_token, settings);

  await page.waitForFunction((settingsVersion) => {
    const events = (
      window as typeof window & {
        __m1WsEvents?: Array<Record<string, unknown>>;
      }
    ).__m1WsEvents;
    return events?.some((event) => {
      const payload = event.payload as Record<string, unknown> | undefined;
      return (
        event.event_type === "settings_updated" &&
        payload?.settings_version === settingsVersion
      );
    });
  }, saved.settings_version);
});

test("realtime reconnect resumes with last_event_id and refreshes settings snapshot", async ({
  page,
  request,
}) => {
  await unlockManagementPin(page);
  ensureSecondaryTerminal();
  const secondarySession = await bootstrapSession(request, SECONDARY_TERMINAL_ID);
  const secondaryHeaders = {
    authorization: `Bearer ${secondarySession.access_token}`,
  };

  const settings = await expectEnvelope<SettingsSnapshot>(
    await request.get("/api/v1/settings", { headers: secondaryHeaders }),
  );

  await forceRealtimeDisconnect(page);
  await expect(page.getByText(/实时连接已断开，正在尝试第 1 次重连/)).toBeVisible();

  const saved = await saveCurrentSettingsSnapshot(
    request,
    secondarySession.access_token,
    settings,
  );

  await expect(page.getByText("实时连接已恢复，正在刷新最新状态。")).toBeVisible();
  await expect(
    page.getByText(`配置 ${formatSettingsVersion(saved.settings_version)}`),
  ).toBeVisible();
});

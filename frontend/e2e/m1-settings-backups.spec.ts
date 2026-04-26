import { expect, test } from "@playwright/test";
import {
  installSmokeBootstrapHook,
  issueBootstrapToken,
  TERMINAL_ID,
  bootstrapTokens,
  expectEnvelope,
  bootstrapSession,
  seedSmokeDeviceFixture,
  saveCurrentSettingsSnapshot,
  SMOKE_DEVICE_ID,
  unlockManagementPin,
  openDeliveryDetails,
  openBackupDetails,
  ensureSecondaryTerminal,
  SECONDARY_TERMINAL_ID,
  formatSettingsVersion,
  openSettingsModuleDetails,
  type AuthSession,
  type SettingsSnapshot,
} from "./support/smokeHelpers";

installSmokeBootstrapHook();

test("shell loads and management PIN unlocks settings", async ({ page }) => {
  await page.goto("/");
  await expect(
    page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "总览", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".home-command-stage")).toBeVisible();

  await unlockManagementPin(page);
  await page
    .getByRole("navigation", { name: "设置分区" })
    .getByRole("button", { name: /首页治理/ })
    .click();
  await expect(page.getByRole("button", { name: "保存首页设置" })).toBeEnabled();

  await openDeliveryDetails(page);
  await expect(page.getByRole("heading", { level: 3, name: "绑定码认领" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "激活凭据交付" })).toBeVisible();

  await openBackupDetails(page);
  await expect(page.getByRole("heading", { name: "恢复历史" })).toBeVisible();
  await page.getByPlaceholder("例如：联调前、夜间稳定版").fill("e2e smoke backup");
  await page
    .locator(".backup-panel__toolbar")
    .getByRole("button", { name: "创建备份" })
    .click();
  await expect(page.getByText(/备份 bk_/)).toBeVisible();
  await expect(page.getByText("e2e smoke backup").first()).toBeVisible();
  await expect(page.getByText("快照摘要").first()).toBeVisible();
});

test("settings can rotate bootstrap token and revoke the previous token", async ({
  page,
  request,
}) => {
  const previousToken = issueBootstrapToken(TERMINAL_ID);

  await unlockManagementPin(page);
  await openDeliveryDetails(page);
  await expect(page.getByRole("heading", { level: 3, name: "认领绑定码" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "激活凭据交付" })).toBeVisible();

  await openSettingsModuleDetails(page, "激活凭据交付");
  await page.getByRole("button", { name: "重置激活凭据" }).click();
  await expect(page.getByRole("heading", { level: 4, name: "本次签发结果" })).toBeVisible();
  await expect(page.getByText("推荐扫码")).toBeVisible();
  await expect(page.getByRole("heading", { level: 4, name: "二维码交付" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 4, name: "激活链接" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 4, name: "激活码" })).toBeVisible();
  await expect(page.getByText("现场排障提示")).toBeVisible();

  const revealedToken = await page
    .locator("section[aria-label='激活凭据签发结果'] textarea")
    .first()
    .inputValue();
  expect(revealedToken).toBeTruthy();
  expect(revealedToken).not.toBe(previousToken);
  bootstrapTokens.set(TERMINAL_ID, revealedToken);

  const revokedResponse = await request.post("/api/v1/auth/session/bootstrap", {
    headers: { authorization: `Bootstrap ${previousToken}` },
  });
  expect(revokedResponse.status()).toBe(401);

  const rotatedSession = await expectEnvelope<AuthSession>(
    await request.post("/api/v1/auth/session/bootstrap", {
      headers: { authorization: `Bootstrap ${revealedToken}` },
    }),
  );
  expect(rotatedSession.terminal_id).toBe(TERMINAL_ID);
});

test("devices page can add and remove a home entry", async ({ page, request }) => {
  test.setTimeout(60_000);

  const session = await bootstrapSession(request);
  const headers = { authorization: `Bearer ${session.access_token}` };
  seedSmokeDeviceFixture();

  const settings = await expectEnvelope<SettingsSnapshot>(
    await request.get("/api/v1/settings", { headers }),
  );
  await saveCurrentSettingsSnapshot(request, session.access_token, {
    ...settings,
    function_settings: {
      low_battery_threshold: settings.function_settings?.low_battery_threshold ?? 20,
      offline_threshold_seconds: settings.function_settings?.offline_threshold_seconds ?? 90,
      quick_entry_policy: {
        ...(settings.function_settings?.quick_entry_policy ?? {}),
        favorites: true,
      },
      music_enabled: settings.function_settings?.music_enabled ?? true,
      favorite_limit: settings.function_settings?.favorite_limit ?? 8,
      auto_home_timeout_seconds: settings.function_settings?.auto_home_timeout_seconds ?? 180,
      position_device_thresholds: settings.function_settings?.position_device_thresholds ?? {
        closed_max: 5,
        opened_min: 95,
      },
    },
    favorites: settings.favorites.filter((favorite) => favorite.device_id !== SMOKE_DEVICE_ID),
  });

  const topNav = page.getByRole("navigation", { name: "Primary" });

  await page.goto("/");
  await topNav.getByRole("link", { name: "设备", exact: true }).click();
  await expect(page.getByRole("heading", { name: "设备浏览与加入首页" })).toBeVisible();

  const row = page.locator("article").filter({ hasText: "E2E 客厅主灯" }).first();
  await expect(row).toContainText("可加入首页");
  await row.getByRole("button", { name: "加入首页" }).click();
  await expect(page.getByText(/已加入首页/)).toBeVisible();
  await expect(row).toContainText("已在首页");

  const afterAdd = await expectEnvelope<SettingsSnapshot>(
    await request.get("/api/v1/settings", { headers }),
  );
  expect(
    afterAdd.favorites.some(
      (favorite) => favorite.device_id === SMOKE_DEVICE_ID && favorite.selected,
    ),
  ).toBe(true);

  await topNav.getByRole("link", { name: "总览", exact: true }).click();
  const favoriteSection = page.locator("section[aria-label='首页常用设备']");
  const favoriteDeviceRow = favoriteSection.locator(".home-favorite-device-row", {
    hasText: "E2E 客厅主灯",
  });
  await expect(favoriteDeviceRow).toBeVisible();
  await favoriteDeviceRow.click();
  await expect(page.getByRole("heading", { name: "灯光控制" })).toBeVisible();
  await expect(page.getByText("E2E 客厅主灯").first()).toBeVisible();
  const controlDialog = page.getByRole("dialog");
  await expect(controlDialog.getByText("1 个控制项")).toBeVisible();
  await expect(controlDialog.getByRole("button", { name: "开启", exact: true })).toBeVisible();
  await expect(controlDialog.getByRole("button", { name: "关闭", exact: true })).toBeVisible();
  await controlDialog.getByRole("button", { name: "关闭弹窗" }).click();

  await topNav.getByRole("link", { name: "设备", exact: true }).click();
  await row.getByRole("button", { name: "移出首页" }).click();
  await expect(page.getByText(/已移出首页/)).toBeVisible();
  await expect(row).toContainText("可加入首页");

  const afterRemove = await expectEnvelope<SettingsSnapshot>(
    await request.get("/api/v1/settings", { headers }),
  );
  expect(
    afterRemove.favorites.some(
      (favorite) => favorite.device_id === SMOKE_DEVICE_ID && favorite.selected,
    ),
  ).toBe(false);

  await topNav.getByRole("link", { name: "总览", exact: true }).click();
  await expect(page.getByText("暂无常用设备").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "添加设备" }).first()).toBeVisible();

  await saveCurrentSettingsSnapshot(request, session.access_token, {
    ...afterRemove,
    function_settings: {
      low_battery_threshold: afterRemove.function_settings?.low_battery_threshold ?? 20,
      offline_threshold_seconds:
        afterRemove.function_settings?.offline_threshold_seconds ?? 90,
      quick_entry_policy: {
        ...(afterRemove.function_settings?.quick_entry_policy ?? {}),
        favorites: false,
      },
      music_enabled: afterRemove.function_settings?.music_enabled ?? true,
      favorite_limit: afterRemove.function_settings?.favorite_limit ?? 8,
      auto_home_timeout_seconds:
        afterRemove.function_settings?.auto_home_timeout_seconds ?? 180,
      position_device_thresholds: afterRemove.function_settings
        ?.position_device_thresholds ?? {
        closed_max: 5,
        opened_min: 95,
      },
    },
  });
  await page.reload();
  await expect(favoriteSection).toBeHidden();
  await expect(page.getByRole("button", { name: "首页常用设备" })).toHaveCount(0);
});

test("backup restore syncs to another terminal through realtime", async ({
  page,
  request,
}) => {
  await unlockManagementPin(page);
  await openBackupDetails(page);

  ensureSecondaryTerminal();
  const secondarySession = await bootstrapSession(request, SECONDARY_TERMINAL_ID);
  const secondaryHeaders = {
    authorization: `Bearer ${secondarySession.access_token}`,
  };

  const backupNote = `cross-terminal-${Date.now()}`;
  const created = await expectEnvelope<{ backup_id: string }>(
    await request.post("/api/v1/system/backups", {
      headers: secondaryHeaders,
      data: { note: backupNote },
    }),
  );

  const restored = await expectEnvelope<{
    backup_id?: string;
    settings_version: string;
  }>(
    await request.post(`/api/v1/system/backups/${created.backup_id}/restore`, {
      headers: secondaryHeaders,
      data: {},
    }),
  );

  await expect(page.getByText(backupNote).first()).toBeVisible();
  await expect(
    page.getByText(formatSettingsVersion(restored.settings_version)).first(),
  ).toBeVisible();
});

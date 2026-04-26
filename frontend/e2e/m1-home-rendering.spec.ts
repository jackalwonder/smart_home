import { expect, test } from "@playwright/test";
import {
  installSmokeBootstrapHook,
  TINY_PNG,
  successEnvelope,
  HOME_ID,
} from "./support/smokeHelpers";

installSmokeBootstrapHook();

test("home overview renders built-in and custom hotspot icons", async ({ page }) => {
  const customIconUrl = `data:image/png;base64,${TINY_PNG.toString("base64")}`;

  await page.route("**/api/v1/home/overview", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        successEnvelope({
          layout_version: "layout-e2e-icons",
          settings_version: "settings-e2e-icons",
          cache_mode: false,
          home_info: {
            home_id: HOME_ID,
            home_name: "E2E Home",
          },
          stage: {
            background_image_url: null,
            hotspots: [
              {
                hotspot_id: "hotspot-fridge-icon",
                device_id: "device-fridge-icon",
                display_name: "冰箱热点",
                device_type: "FRIDGE",
                x: 0.38,
                y: 0.26,
                icon_type: "refrigerator",
                icon_asset_id: null,
                icon_asset_url: null,
                label_mode: "AUTO",
                status: "idle",
                status_summary: "待机",
                is_offline: false,
                is_complex_device: true,
                is_readonly_device: false,
                entry_behavior: "OPEN_PANEL",
              },
              {
                hotspot_id: "hotspot-light-icon",
                device_id: "device-light-icon",
                display_name: "灯光热点",
                device_type: "LIGHT",
                x: 0.5,
                y: 0.48,
                icon_type: "lightbulb",
                icon_asset_id: null,
                icon_asset_url: null,
                label_mode: "AUTO",
                status: "on",
                status_summary: "已开启",
                is_offline: false,
                is_complex_device: false,
                is_readonly_device: false,
                entry_behavior: "TOGGLE",
              },
              {
                hotspot_id: "hotspot-custom-icon",
                device_id: "device-custom-icon",
                display_name: "自定义热点",
                device_type: "SWITCH",
                x: 0.62,
                y: 0.36,
                icon_type: "device",
                icon_asset_id: "custom-asset",
                icon_asset_url: customIconUrl,
                label_mode: "AUTO",
                status: "idle",
                status_summary: "待机",
                is_offline: false,
                is_complex_device: false,
                is_readonly_device: false,
                entry_behavior: "OPEN_PANEL",
              },
            ],
          },
          sidebar: {
            summary: {
              online_count: 3,
              offline_count: 0,
              lights_on_count: 1,
              running_device_count: 1,
              low_battery_count: 0,
              position_device_summary: {
                opened_count: 0,
                closed_count: 0,
                partial_count: 0,
              },
            },
            weather: {
              cache_mode: false,
              condition: "晴",
              fetched_at: new Date().toISOString(),
              temperature: "22",
              humidity: "45%",
            },
            datetime: { current_time: new Date().toISOString() },
            music_card: {
              binding_status: "UNBOUND",
              availability_status: "UNKNOWN",
              device_id: null,
              display_name: null,
              entry_behavior: null,
              play_state: null,
              track_title: null,
              artist: null,
            },
          },
          favorite_devices: [],
          energy_bar: {
            binding_status: "UNBOUND",
            refresh_status: "IDLE",
            monthly_usage: null,
            balance: null,
          },
          quick_entries: {},
          system_state: {
            default_media: {
              binding_status: "UNBOUND",
              device_id: null,
              display_name: null,
              play_state: null,
            },
            home_assistant: null,
          },
          ui_policy: {
            favorite_limit: 8,
            room_label_mode: "EDIT_ONLY",
          },
        }),
      ),
    });
  });

  await page.route("**/api/v1/devices?page=1&page_size=200", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        successEnvelope({
          items: [],
          page: 1,
          page_size: 200,
          total: 0,
        }),
      ),
    });
  });

  await page.goto("/");
  await expect(page.locator(".home-command-stage")).toBeVisible();

  const fridgeIcon = page.locator(
    '.home-hotspot-overlay__item[aria-label="冰箱热点"] .hotspot-icon--refrigerator',
  );
  const lightIcon = page.locator(
    '.home-hotspot-overlay__item[aria-label="灯光热点"] .hotspot-icon--lightbulb',
  );
  const customIcon = page.locator(
    '.home-hotspot-overlay__item[aria-label="自定义热点"] .hotspot-icon.has-custom-icon img',
  );

  await expect(fridgeIcon).toBeVisible();
  await expect(fridgeIcon.locator("svg")).toBeVisible();
  await expect(lightIcon).toBeVisible();
  await expect(lightIcon.locator("svg")).toBeVisible();
  await expect(customIcon).toBeVisible();

  expect(await fridgeIcon.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  expect(await lightIcon.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
});

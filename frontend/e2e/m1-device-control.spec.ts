import { expect, test } from "@playwright/test";
import {
  installSmokeBootstrapHook,
  expectEnvelope,
  bootstrapSession,
  ensureDevicesReady,
  successEnvelope,
  HOME_ID,
  unlockManagementPin,
  openHomeDashboard,
  type Envelope,
} from "./support/smokeHelpers";

installSmokeBootstrapHook();

test("device control request reports execution or HA unavailability explicitly", async ({
  request,
}) => {
  const session = await bootstrapSession(request);
  const supportedRequest = await ensureDevicesReady(request, session.access_token);
  const requestId = `e2e-control-${Date.now()}`;
  const headers = { authorization: `Bearer ${session.access_token}` };

  const acceptedResponse = await request.post("/api/v1/device-controls", {
    headers,
    data: {
      request_id: requestId,
      device_id: supportedRequest.device_id,
      action_type: supportedRequest.action_type,
      payload: supportedRequest.payload,
      client_ts: new Date().toISOString(),
    },
  });

  if (!acceptedResponse.ok()) {
    expect(acceptedResponse.status()).toBe(503);
    const envelope = (await acceptedResponse.json()) as Envelope<null>;
    expect(envelope.success).toBe(false);
    expect(envelope.error?.code).toBe("HA_UNAVAILABLE");
    return;
  }

  const accepted = (await acceptedResponse.json()) as Envelope<{
    accepted: boolean;
    request_id: string;
  }>;
  expect(accepted.success, accepted.error?.message).toBe(true);
  expect(accepted.data.accepted).toBe(true);
  expect(accepted.data.request_id).toBe(requestId);

  let queried: {
    execution_status: string;
    request_id: string;
  } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    queried = await expectEnvelope<{
      execution_status: string;
      request_id: string;
    }>(
      await request.get(`/api/v1/device-controls/${requestId}`, {
        headers,
      }),
    );
    if (queried.execution_status !== "PENDING") {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  expect(queried).not.toBeNull();
  expect(queried?.request_id).toBe(requestId);
  expect(["SUCCESS", "FAILED", "TIMEOUT", "STATE_MISMATCH", "PENDING"]).toContain(
    queried?.execution_status,
  );
});

test("home control UI sends null payload for no-value actions and shows result", async ({
  page,
}) => {
  const deviceId = "11111111-1111-1111-1111-000000000101";
  const requestId = "home-ui-none-control";
  let postedBody: Record<string, unknown> | null = null;

  await page.route("**/api/v1/home/overview", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        successEnvelope({
          layout_version: "layout-e2e-none",
          settings_version: "settings-e2e-none",
          cache_mode: false,
          home_info: {
            home_id: HOME_ID,
            home_name: "E2E Home",
          },
          stage: {
            background_image_url: null,
            hotspots: [
              {
                hotspot_id: "hotspot-none-control",
                device_id: deviceId,
                display_name: "无值测试开关",
                device_type: "switch",
                x: 0.42,
                y: 0.46,
                icon_type: "device",
                label_mode: "ALWAYS",
                status: "idle",
                status_summary: "待命",
                is_offline: false,
                is_complex_device: false,
                is_readonly_device: false,
                entry_behavior: "OPEN_PANEL",
              },
            ],
          },
          sidebar: {
            summary: {
              online_count: 1,
              offline_count: 0,
              lights_on_count: 0,
              running_device_count: 0,
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

  await page.route(`**/api/v1/devices/${deviceId}**`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        successEnvelope({
          device_id: deviceId,
          display_name: "无值测试开关",
          raw_name: "No Value Switch",
          device_type: "switch",
          room_id: null,
          room_name: "测试房间",
          status: "idle",
          is_offline: false,
          is_complex_device: false,
          is_readonly_device: false,
          confirmation_type: "ACK_DRIVEN",
          entry_behavior: "OPEN_PANEL",
          default_control_target: null,
          capabilities: {},
          alert_badges: [],
          status_summary: {},
          runtime_state: {
            aggregated_mode: null,
            aggregated_position: null,
            aggregated_state: "idle",
            alerts: [],
            last_state_update_at: null,
            telemetry: {},
          },
          control_schema: [
            {
              action_type: "TRIGGER_SCENE",
              target_scope: "PRIMARY",
              target_key: "button.trigger",
              value_type: "NONE",
              value_range: null,
              allowed_values: null,
              unit: null,
              is_quick_action: true,
              requires_detail_entry: false,
            },
            {
              action_type: "TOGGLE_POWER",
              target_scope: "PRIMARY",
              target_key: "power",
              value_type: "BOOLEAN",
              value_range: null,
              allowed_values: null,
              unit: null,
              is_quick_action: true,
              requires_detail_entry: false,
            },
            {
              action_type: "SET_BRIGHTNESS",
              target_scope: "PRIMARY",
              target_key: "brightness",
              value_type: "NUMBER",
              value_range: { min: 0, max: 100, step: 5 },
              allowed_values: null,
              unit: "%",
              is_quick_action: true,
              requires_detail_entry: false,
            },
            {
              action_type: "SET_MODE",
              target_scope: "PRIMARY",
              target_key: "mode",
              value_type: "STRING",
              value_range: null,
              allowed_values: ["cool", "heat", "dry"],
              unit: null,
              is_quick_action: false,
              requires_detail_entry: true,
            },
          ],
          editor_config: { hotspots: [] },
          source_info: { entity_links: [] },
        }),
      ),
    });
  });

  await page.route("**/api/v1/device-controls/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        successEnvelope({
          request_id: requestId,
          device_id: deviceId,
          action_type: "TRIGGER_SCENE",
          payload: {
            target_scope: "PRIMARY",
            target_key: "button.trigger",
            value: null,
            unit: null,
          },
          acceptance_status: "ACCEPTED",
          confirmation_type: "ACK_DRIVEN",
          execution_status: "SUCCESS",
          retry_count: 0,
          final_runtime_state: { triggered: true },
          error_code: null,
          error_message: null,
          accepted_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        }),
      ),
    });
  });

  await page.route("**/api/v1/device-controls", async (route) => {
    postedBody = (await route.request().postDataJSON()) as Record<string, unknown>;
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify(
        successEnvelope({
          request_id: requestId,
          device_id: deviceId,
          accepted: true,
          acceptance_status: "ACCEPTED",
          confirmation_type: "ACK_DRIVEN",
          accepted_at: new Date().toISOString(),
          timeout_seconds: 30,
          retry_scheduled: false,
          message: "Control request accepted",
          result_query_path: `/api/v1/device-controls/${requestId}`,
        }),
      ),
    });
  });

  await unlockManagementPin(page);
  await openHomeDashboard(page);
  await page.getByRole("button", { name: "无值测试开关" }).click();
  await expect(page.locator(".home-hotspot-control-modal.is-detail")).toBeVisible();
  await expect(page.locator(".home-device-control-panel")).toHaveCount(0);
  await expect(page.locator(".home-hotspot-control-modal__detail-card")).toBeVisible();
  await expect(page.locator(".home-hotspot-control-modal__detail-control")).toHaveCount(4);
  await page.locator(".home-hotspot-control-modal__detail-apply").first().click();

  expect(postedBody).toBeTruthy();
  expect((postedBody?.payload as { value?: unknown } | undefined)?.value).toBeNull();
  expect((postedBody?.payload as { target_key?: unknown } | undefined)?.target_key).toBe(
    "button.trigger",
  );
});

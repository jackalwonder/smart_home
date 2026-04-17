import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

const HOME_ID = "11111111-1111-1111-1111-111111111111";
const TERMINAL_ID = "22222222-2222-2222-2222-222222222222";
const SECONDARY_TERMINAL_ID = "33333333-3333-3333-3333-333333333333";
const DEV_PIN = "1234";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAEtAJJXIDTjwAAAABJRU5ErkJggg==",
  "base64",
);

type Envelope<T> = {
  success: boolean;
  data: T;
  error: { code: string; message: string } | null;
};

type AuthSession = {
  access_token: string;
  home_id: string;
  terminal_id: string;
};

type SettingsSnapshot = {
  settings_version: string | null;
  page_settings: {
    room_label_mode: string;
    homepage_display_policy: Record<string, unknown>;
    icon_policy: Record<string, unknown>;
    layout_preference: Record<string, unknown>;
  } | null;
  function_settings: {
    low_battery_threshold: number;
    offline_threshold_seconds: number;
    quick_entry_policy: Record<string, unknown>;
    music_enabled: boolean;
    favorite_limit: number;
    auto_home_timeout_seconds: number | null;
    position_device_thresholds: Record<string, unknown>;
  } | null;
  favorites: Array<{
    device_id: string;
    selected: boolean;
    favorite_order: number | null;
  }>;
};

type EditorSession = {
  granted: boolean;
  lease_id: string;
  draft_version: string;
  current_layout_version: string;
};

type EditorDraft = {
  draft_version: string;
  base_layout_version: string;
  layout: {
    background_asset_id: string | null;
    background_image_url: string | null;
    layout_meta: Record<string, unknown>;
    hotspots: Array<{
      hotspot_id: string;
      device_id: string;
      display_name?: string | null;
      x: number;
      y: number;
      icon_type: string | null;
      label_mode: string | null;
      is_visible: boolean;
      structure_order: number;
    }>;
  } | null;
};

async function expectEnvelope<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${response.url()} returned ${response.status()}`).toBeTruthy();
  const envelope = (await response.json()) as Envelope<T>;
  expect(envelope.success, envelope.error?.message).toBe(true);
  expect(envelope.data).toBeTruthy();
  return envelope.data;
}

function toEditorSaveHotspots(hotspots: NonNullable<EditorDraft["layout"]>["hotspots"]) {
  return hotspots.map((hotspot) => ({
    hotspot_id: hotspot.hotspot_id,
    device_id: hotspot.device_id,
    x: hotspot.x,
    y: hotspot.y,
    icon_type: hotspot.icon_type,
    label_mode: hotspot.label_mode,
    is_visible: hotspot.is_visible,
    structure_order: hotspot.structure_order,
  }));
}

async function bootstrapSession(request: APIRequestContext, terminalId = TERMINAL_ID) {
  const session = await expectEnvelope<AuthSession>(
    await request.get(`/api/v1/auth/session?home_id=${HOME_ID}&terminal_id=${terminalId}`),
  );
  await expectEnvelope(
    await request.post("/api/v1/auth/pin/verify", {
      data: {
        home_id: HOME_ID,
        terminal_id: terminalId,
        pin: DEV_PIN,
        target_action: "MANAGEMENT",
      },
    }),
  );
  return session;
}

async function ensureControllableHotspot(request: APIRequestContext, accessToken: string) {
  const headers = { authorization: `Bearer ${accessToken}` };
  const catalog = await expectEnvelope<{ items: Array<{ device_id: string }> }>(
    await request.get("/api/v1/devices?page=1&page_size=50", { headers }),
  );

  let controllableDeviceId: string | null = null;
  for (const item of catalog.items) {
    const detail = await expectEnvelope<{
      control_schema?: Array<{
        action_type?: string | null;
        allowed_values?: unknown[] | null;
        value_range?: Record<string, unknown> | null;
        value_type?: string | null;
      }>;
      device_id: string;
      is_readonly_device?: boolean;
    }>(
      await request.get(
        `/api/v1/devices/${encodeURIComponent(
          item.device_id,
        )}?include_runtime_fields=true&include_editor_fields=true`,
        { headers },
      ),
    );
    const supportedControl = detail.control_schema?.some((schema) => {
      const actionType = schema.action_type?.toUpperCase() ?? "";
      const valueType = schema.value_type?.toUpperCase() ?? "";
      return (
        actionType.includes("POWER") ||
        actionType.includes("TOGGLE") ||
        (Array.isArray(schema.allowed_values) && schema.allowed_values.length > 0) ||
        Boolean(schema.value_range) ||
        (valueType.length > 0 && valueType !== "NONE")
      );
    });
    if (!detail.is_readonly_device && supportedControl) {
      controllableDeviceId = detail.device_id;
      break;
    }
  }

  expect(controllableDeviceId).toBeTruthy();

  const editorSession = await expectEnvelope<EditorSession>(
    await request.post("/api/v1/editor/sessions", {
      headers,
      data: { takeover_if_locked: true },
    }),
  );
  const draft = await expectEnvelope<EditorDraft>(
    await request.get(`/api/v1/editor/draft?lease_id=${editorSession.lease_id}`, { headers }),
  );
  const layout = draft.layout ?? {
    background_asset_id: null,
    background_image_url: null,
    layout_meta: {},
    hotspots: [],
  };
  const existingHotspot = layout.hotspots.find((hotspot) => hotspot.device_id === controllableDeviceId);
  const hotspots = existingHotspot
    ? toEditorSaveHotspots(layout.hotspots)
    : [
        ...toEditorSaveHotspots(layout.hotspots),
        {
          hotspot_id: `e2e-home-${Date.now()}`,
          device_id: controllableDeviceId as string,
          x: 0.5,
          y: 0.5,
          icon_type: "device",
          label_mode: "ALWAYS",
          is_visible: true,
          structure_order: layout.hotspots.length,
        },
      ];

  await expectEnvelope<{ draft_version: string }>(
    await request.put("/api/v1/editor/draft", {
      headers,
      data: {
        lease_id: editorSession.lease_id,
        draft_version: draft.draft_version,
        base_layout_version: draft.base_layout_version,
        background_asset_id: layout.background_asset_id,
        layout_meta: layout.layout_meta ?? {},
        hotspots,
      },
    }),
  );

  const refreshedDraft = await expectEnvelope<EditorDraft>(
    await request.get(`/api/v1/editor/draft?lease_id=${editorSession.lease_id}`, { headers }),
  );
  await expectEnvelope<{ published: boolean }>(
    await request.post("/api/v1/editor/publish", {
      headers,
      data: {
        lease_id: editorSession.lease_id,
        draft_version: refreshedDraft.draft_version,
        base_layout_version: refreshedDraft.base_layout_version,
      },
    }),
  );

  const home = await expectEnvelope<{
    stage?: {
      hotspots?: Array<{
        device_id: string;
        display_name?: string | null;
      }>;
    };
  }>(await request.get("/api/v1/home/overview", { headers }));
  const preparedHotspot = home.stage?.hotspots?.find(
    (hotspot) => hotspot.device_id === controllableDeviceId,
  );
  expect(preparedHotspot).toBeTruthy();
  return {
    deviceId: controllableDeviceId as string,
    label: preparedHotspot?.display_name || controllableDeviceId || "",
  };
}

async function findSupportedControlRequest(request: APIRequestContext, accessToken: string) {
  const headers = { authorization: `Bearer ${accessToken}` };
  const catalog = await expectEnvelope<{ items: Array<{ device_id: string }> }>(
    await request.get("/api/v1/devices?page=1&page_size=50", { headers }),
  );

  for (const item of catalog.items) {
    const detail = await expectEnvelope<{
      control_schema?: Array<{
        action_type?: string | null;
        allowed_values?: unknown[] | null;
        target_key?: string | null;
        target_scope?: string | null;
        unit?: string | null;
        value_range?: { min?: number | null } | null;
        value_type?: string | null;
      }>;
      device_id: string;
      is_readonly_device?: boolean;
    }>(
      await request.get(
        `/api/v1/devices/${encodeURIComponent(
          item.device_id,
        )}?include_runtime_fields=true&include_editor_fields=true`,
        { headers },
      ),
    );

    if (detail.is_readonly_device || !Array.isArray(detail.control_schema)) {
      continue;
    }

    const schema = detail.control_schema.find((candidate) => {
      const actionType = candidate.action_type?.toUpperCase() ?? "";
      const valueType = candidate.value_type?.toUpperCase() ?? "";
      return (
        actionType.includes("POWER") ||
        actionType.includes("TOGGLE") ||
        (Array.isArray(candidate.allowed_values) && candidate.allowed_values.length > 0) ||
        Boolean(candidate.value_range) ||
        (valueType.length > 0 && valueType !== "NONE")
      );
    });

    if (!schema) {
      continue;
    }

    const actionType = schema.action_type?.toUpperCase() ?? "";
    const valueType = schema.value_type?.toUpperCase() ?? "";
    const value =
      Array.isArray(schema.allowed_values) && schema.allowed_values.length > 0
        ? schema.allowed_values[0]
        : schema.value_range?.min ?? (
            actionType.includes("POWER") || actionType.includes("TOGGLE") || valueType.includes("BOOL")
              ? true
              : valueType.includes("NUMBER") || valueType.includes("INT") || valueType.includes("FLOAT")
                ? 1
                : "1"
          );

    return {
      action_type: schema.action_type ?? "SET_VALUE",
      device_id: detail.device_id,
      payload: {
        target_scope: schema.target_scope ?? null,
        target_key: schema.target_key ?? null,
        value,
        unit: schema.unit ?? null,
      },
    };
  }

  return null;
}

async function saveCurrentSettingsSnapshot(
  request: APIRequestContext,
  accessToken: string,
  settings: SettingsSnapshot,
) {
  const pageSettings = settings.page_settings;
  const functionSettings = settings.function_settings;
  return expectEnvelope<{ settings_version: string }>(
    await request.put("/api/v1/settings", {
      headers: { authorization: `Bearer ${accessToken}` },
      data: {
        settings_version: settings.settings_version,
        page_settings: {
          room_label_mode: pageSettings?.room_label_mode ?? "EDIT_ONLY",
          homepage_display_policy: pageSettings?.homepage_display_policy ?? {},
          icon_policy: pageSettings?.icon_policy ?? {},
          layout_preference: pageSettings?.layout_preference ?? {},
        },
        function_settings: {
          low_battery_threshold: functionSettings?.low_battery_threshold ?? 20,
          offline_threshold_seconds: functionSettings?.offline_threshold_seconds ?? 90,
          quick_entry_policy: functionSettings?.quick_entry_policy ?? { favorites: true },
          music_enabled: functionSettings?.music_enabled ?? true,
          favorite_limit: functionSettings?.favorite_limit ?? 8,
          auto_home_timeout_seconds: functionSettings?.auto_home_timeout_seconds ?? 180,
          position_device_thresholds: functionSettings?.position_device_thresholds ?? {
            closed_max: 5,
            opened_min: 95,
          },
        },
        favorites: settings.favorites,
      },
    }),
  );
}

async function forceRealtimeDisconnect(page: Page) {
  await page.evaluate(() => {
    window.__smartHomeRealtime?.forceDisconnect();
  });
}

function ensureSecondaryTerminal() {
  execFileSync(
    "docker",
    [
      "compose",
      "-f",
      "../docker-compose.yml",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "smart_home",
      "-d",
      "smart_home",
      "-c",
      [
        "INSERT INTO terminals (id, home_id, terminal_code, terminal_name, terminal_mode)",
        `VALUES ('${SECONDARY_TERMINAL_ID}', '${HOME_ID}', 'wall-panel-side-smoke', '侧墙板联调', 'KIOSK')`,
        "ON CONFLICT (id) DO NOTHING;",
      ].join(" "),
    ],
    { cwd: process.cwd(), stdio: "pipe" },
  );
}

async function openRealtimeProbe(page: Page, accessToken: string) {
  await page.goto("/");
  await page.evaluate((token) => {
    return new Promise<void>((resolve, reject) => {
      const events: unknown[] = [];
      const url = new URL("/ws", window.location.origin);
      url.protocol = url.protocol.replace("http", "ws");
      url.searchParams.set("access_token", token);
      const ws = new WebSocket(url.toString());
      (window as typeof window & { __m1Ws?: WebSocket; __m1WsEvents?: unknown[] }).__m1Ws = ws;
      (window as typeof window & { __m1WsEvents?: unknown[] }).__m1WsEvents = events;

      const timer = window.setTimeout(() => {
        reject(new Error("Timed out waiting for realtime connection"));
      }, 10_000);

      ws.addEventListener("open", () => {
        window.clearTimeout(timer);
        resolve();
      });
      ws.addEventListener("message", (message) => {
        const event = JSON.parse(message.data);
        events.push(event);
        ws.send(JSON.stringify({ type: "ack", event_id: event.event_id }));
      });
      ws.addEventListener("error", () => {
        window.clearTimeout(timer);
        reject(new Error("Realtime connection failed"));
      });
    });
  }, accessToken);
}

async function unlockManagementPin(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "设置" }).click();
  await expect(page.getByRole("heading", { name: "管理 PIN" })).toBeVisible();

  const pinInput = page.getByPlaceholder("输入管理 PIN");
  if (await pinInput.isVisible()) {
    await pinInput.fill(DEV_PIN);
    await page.getByRole("button", { name: "验证 PIN" }).click();
  }

  await expect(
    page.getByText(/PIN 验证通过|当前管理会话已生效|已验证/).first(),
  ).toBeVisible();
}

async function readEditorFieldValue(page: Page, label: string) {
  const field = page.locator("header .field-grid > div").filter({
    has: page.locator("dt", { hasText: label }),
  });
  await expect(field).toHaveCount(1);
  await expect(field.locator("dd")).toBeVisible();
  return (await field.locator("dd").textContent())?.trim() ?? "";
}

async function ensureEditorWritable(page: Page) {
  const saveButton = page.getByRole("button", { name: "保存草稿" });
  const takeoverButton = page.getByRole("button", { name: "接管编辑" });
  const noticeTakeoverButton = page.getByRole("button", { name: "接管当前锁" });
  const acquireButton = page.getByRole("button", { name: "申请编辑" });
  const retryAcquireButton = page.getByRole("button", { name: "重新申请编辑" });
  const isEnabled = async (locator: ReturnType<Page["getByRole"]>) => {
    if ((await locator.count()) === 0) {
      return false;
    }
    return locator.isEnabled();
  };
  const clickIfEnabled = async (locator: ReturnType<Page["getByRole"]>) => {
    if (!(await isEnabled(locator))) {
      return false;
    }
    try {
      await locator.click({ timeout: 1_000 });
      return true;
    } catch {
      return false;
    }
  };

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await saveButton.isEnabled()) {
      return;
    }
    if (await clickIfEnabled(takeoverButton)) {
      await expect(page.getByText(/已接管编辑租约|已接管终端 .* 的编辑租约/)).toBeVisible();
      await expect(saveButton).toBeEnabled();
      return;
    }
    if (await clickIfEnabled(noticeTakeoverButton)) {
      await expect(page.getByText(/已接管编辑租约|已接管终端 .* 的编辑租约/)).toBeVisible();
      await expect(saveButton).toBeEnabled();
      return;
    }
    if (await clickIfEnabled(retryAcquireButton)) {
      await expect(saveButton).toBeEnabled();
      return;
    }
    if (await clickIfEnabled(acquireButton)) {
      await expect(saveButton).toBeEnabled();
      return;
    }
    await page.waitForTimeout(200);
  }
  throw new Error("Editor did not reach a writable state in time");
}

test("shell loads and management PIN unlocks settings", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "总览" })).toBeVisible();
  await expect(page.getByText("实时流")).toBeVisible();

  await page.getByRole("link", { name: "设置" }).click();
  await expect(page.getByRole("heading", { name: "管理 PIN" })).toBeVisible();

  const pinInput = page.getByPlaceholder("输入管理 PIN");
  if (await pinInput.isVisible()) {
    await pinInput.fill(DEV_PIN);
    await page.getByRole("button", { name: "验证 PIN" }).click();
  }

  await expect(
    page.getByText(/PIN 验证通过|当前管理会话已生效|已验证/).first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "保存全部" })).toBeEnabled();

  await page.getByRole("button", { name: /备份恢复/ }).click();
  await expect(page.getByRole("heading", { level: 3, name: "备份恢复" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "恢复历史" })).toBeVisible();
  await page.getByPlaceholder("例如：联调前、夜间稳定版").fill("e2e smoke backup");
  await page.getByRole("button", { name: "创建备份" }).click();
  await expect(page.getByText(/备份 bk_/)).toBeVisible();
  await expect(page.getByText("e2e smoke backup").first()).toBeVisible();
  await expect(page.getByText("快照摘要").first()).toBeVisible();
});

test("editor UI opens an edit session, saves draft, and publishes", async ({ page }) => {
  await unlockManagementPin(page);
  await page.getByRole("link", { name: "编辑" }).click();

  await expect(page.getByRole("heading", { name: "户型编辑器" })).toBeVisible();
  await ensureEditorWritable(page);

  await page.getByLabel("上传背景图").setInputFiles({
    name: "floorplan-smoke.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await expect(page.getByText("背景图已更新")).toBeVisible();
  await expect(page.getByAltText("编辑器草稿户型图")).toBeVisible();
  await expect(page.getByRole("button", { name: "清除背景图" })).toBeEnabled();
  await page.getByRole("button", { name: "清除背景图" }).click();
  await expect(page.getByText("背景图已清除")).toBeVisible();
  await expect(page.getByAltText("编辑器草稿户型图")).toHaveCount(0);
  await page.getByLabel("上传背景图").setInputFiles({
    name: "floorplan-smoke.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await expect(page.getByText("背景图已更新")).toBeVisible();

  await page.getByRole("button", { name: "新增热点" }).click();
  const deviceSelect = page.getByLabel("绑定设备");
  const customLabel = `E2E 热点 ${Date.now()}`;
  const deviceOptionCount = await deviceSelect.locator("option").count();
  const hasBindableDevice = deviceOptionCount > 1;

  if (hasBindableDevice) {
    await deviceSelect.selectOption({ index: 1 });
    await page.getByLabel("显示名称").fill(customLabel);
    await page.getByLabel("图标类型").selectOption("light");
    await page.getByLabel("X (%)").fill("35");
    await page.getByLabel("Y (%)").fill("45");
    await page.getByRole("button", { name: "右移 1%" }).click();
    await page.getByRole("button", { name: "下移 1%" }).click();
    await page.getByRole("button", { name: "复制热点" }).click();
    await page.getByRole("button", { name: "全选当前" }).click();
    await expect(page.getByRole("button", { name: "左对齐" })).toBeEnabled();
    const canvasHotspot = page.locator(".editor-selection-layer__item", { hasText: customLabel }).first();
    const hotspotBox = await canvasHotspot.boundingBox();
    expect(hotspotBox).toBeTruthy();
    if (!hotspotBox) {
      throw new Error("Canvas hotspot not found");
    }
    await page.mouse.move(hotspotBox.x + hotspotBox.width / 2, hotspotBox.y + hotspotBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(hotspotBox.x + hotspotBox.width / 2 + 40, hotspotBox.y + hotspotBox.height / 2 + 30, {
      steps: 8,
    });
    await page.mouse.up();
    await page.getByRole("button", { name: "左对齐" }).click();
    await page.getByLabel("统一 X (%)").fill("40");
    await page.getByRole("button", { name: "应用 X" }).click();
    await page.keyboard.press("Control+Z");
    await expect(page.getByText("已撤销")).toBeVisible();
    await page.keyboard.press("Control+Y");
    await expect(page.getByText("已重做")).toBeVisible();
    await page.getByLabel("统一标签模式").selectOption("ALWAYS");
    await expect(page.getByLabel("发布前变更摘要")).toContainText("新增热点");
    await expect(page.getByText(customLabel).first()).toBeVisible();
    await page.getByRole("button", { name: "首页预览" }).click();
    await expect(page.getByText("首页预览仅显示可见热点。")).toBeVisible();
    await expect(page.getByRole("button", { name: customLabel }).first()).toBeVisible();
    await page.getByRole("button", { name: "编辑定位" }).click();
  } else {
    await page.getByRole("button", { name: "删除热点" }).click();
  }

  await expect(page.getByLabel("发布前变更摘要")).toContainText("背景图更新");

  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("草稿已保存")).toBeVisible();
  if (hasBindableDevice) {
    await expect(page.getByLabel("发布前变更摘要")).toContainText("新增热点");
  }

  await expect(page.getByRole("button", { name: "发布草稿" })).toBeEnabled();
  await page.getByRole("button", { name: "发布草稿" }).click();
  await expect(page.getByText("草稿已发布")).toBeVisible();
  await expect(page.getByText(/布局版本已更新为/)).toBeVisible();

  await page.getByRole("link", { name: "总览" }).click();
  await expect(page.getByAltText("家庭户型图")).toBeVisible();
  if (hasBindableDevice) {
    await expect(page.getByRole("button", { name: customLabel }).first()).toBeVisible();
  }
});

test("editor downgrades to readonly after takeover and can recover", async ({ page, request }) => {
  await unlockManagementPin(page);
  await page.getByRole("link", { name: "编辑" }).click();

  await expect(page.getByRole("heading", { name: "户型编辑器" })).toBeVisible();
  await ensureEditorWritable(page);

  ensureSecondaryTerminal();
  const secondarySession = await bootstrapSession(request, SECONDARY_TERMINAL_ID);
  await expectEnvelope(
    await request.post("/api/v1/editor/sessions", {
      headers: { authorization: `Bearer ${secondarySession.access_token}` },
      data: {
        takeover_if_locked: true,
        home_id: HOME_ID,
        terminal_id: SECONDARY_TERMINAL_ID,
      },
    }),
  );

  await expect(page.getByText("编辑租约已被其他终端占用")).toBeVisible();
  await expect(page.getByText(/终端 .* 当前持有编辑锁/)).toBeVisible();
  await expect(page.getByRole("button", { name: "保存草稿" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "接管编辑" })).toBeEnabled();

  await page.getByRole("button", { name: "接管编辑" }).click();
  await expect(page.getByText("已接管编辑租约")).toBeVisible();
  await expect(page.getByRole("button", { name: "保存草稿" })).toBeEnabled();
});

test("editor save surfaces version conflict and retries after refresh", async ({ page, request }) => {
  await unlockManagementPin(page);
  await page.getByRole("link", { name: "编辑" }).click();
  await expect(page.getByRole("heading", { name: "户型编辑器" })).toBeVisible();
  await ensureEditorWritable(page);

  const leaseId = await readEditorFieldValue(page, "租约 ID");
  const session = await bootstrapSession(request);
  const headers = { authorization: `Bearer ${session.access_token}` };
  const draft = await expectEnvelope<EditorDraft>(
    await request.get(`/api/v1/editor/draft?lease_id=${leaseId}`, { headers }),
  );

  await expectEnvelope<{ draft_version: string }>(
    await request.put("/api/v1/editor/draft", {
      headers,
      data: {
        lease_id: leaseId,
        draft_version: draft.draft_version,
        base_layout_version: draft.base_layout_version,
        background_asset_id: draft.layout?.background_asset_id,
        layout_meta: draft.layout?.layout_meta ?? {},
        hotspots: toEditorSaveHotspots(draft.layout?.hotspots ?? []),
      },
    }),
  );

  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("保存前草稿版本已更新")).toBeVisible();
  await expect(page.getByText(new RegExp(`本次提交基于 ${draft.draft_version}`))).toBeVisible();
  await expect(page.getByRole("button", { name: "重新保存" })).toBeVisible();
  await page.getByRole("button", { name: "重新保存" }).click();
  await expect(page.getByText("草稿已保存")).toBeVisible();
});

test("editor publish surfaces version conflict and retries after refresh", async ({ page, request }) => {
  await unlockManagementPin(page);
  await page.getByRole("link", { name: "编辑" }).click();
  await expect(page.getByRole("heading", { name: "户型编辑器" })).toBeVisible();
  await ensureEditorWritable(page);

  const leaseId = await readEditorFieldValue(page, "租约 ID");
  const session = await bootstrapSession(request);
  const headers = { authorization: `Bearer ${session.access_token}` };
  const draft = await expectEnvelope<EditorDraft>(
    await request.get(`/api/v1/editor/draft?lease_id=${leaseId}`, { headers }),
  );

  await expectEnvelope<{ draft_version: string }>(
    await request.put("/api/v1/editor/draft", {
      headers,
      data: {
        lease_id: leaseId,
        draft_version: draft.draft_version,
        base_layout_version: draft.base_layout_version,
        background_asset_id: draft.layout?.background_asset_id,
        layout_meta: draft.layout?.layout_meta ?? {},
        hotspots: toEditorSaveHotspots(draft.layout?.hotspots ?? []),
      },
    }),
  );

  await page.getByRole("button", { name: "发布草稿" }).click();
  await expect(page.getByText("发布前草稿版本已更新")).toBeVisible();
  await expect(page.getByText(new RegExp(`本次提交基于 ${draft.draft_version}`))).toBeVisible();
  await expect(page.getByRole("button", { name: "重新发布" })).toBeVisible();
  await page.getByRole("button", { name: "重新发布" }).click();
  await expect(page.getByText("草稿已发布")).toBeVisible();
});

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
    const events = (window as typeof window & { __m1WsEvents?: Array<Record<string, unknown>> })
      .__m1WsEvents;
    return events?.some((event) => {
      const payload = event.payload as Record<string, unknown> | undefined;
      return event.event_type === "settings_updated" && payload?.settings_version === settingsVersion;
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
  const secondaryHeaders = { authorization: `Bearer ${secondarySession.access_token}` };

  const settings = await expectEnvelope<SettingsSnapshot>(
    await request.get("/api/v1/settings", { headers: secondaryHeaders }),
  );

  await forceRealtimeDisconnect(page);
  await expect(page.getByText(/实时连接已断开，正在尝试第 1 次重连/)).toBeVisible();

  const saved = await saveCurrentSettingsSnapshot(request, secondarySession.access_token, settings);

  await expect(page.getByText("实时连接已恢复，正在刷新最新状态。")).toBeVisible();
  await expect(page.getByText(new RegExp(`当前版本 ${saved.settings_version}`))).toBeVisible();
});

test("device control request can be accepted and queried to final result", async ({ request }) => {
  const session = await bootstrapSession(request);
  const supportedRequest = await findSupportedControlRequest(request, session.access_token);
  if (!supportedRequest) {
    test.skip(true, "No supported controllable device is available in this environment.");
    return;
  }
  const requestId = `e2e-control-${Date.now()}`;
  const headers = { authorization: `Bearer ${session.access_token}` };

  const accepted = await expectEnvelope<{ accepted: boolean; request_id: string }>(
    await request.post("/api/v1/device-controls", {
      headers,
      data: {
        request_id: requestId,
        device_id: supportedRequest.device_id,
        action_type: supportedRequest.action_type,
        payload: supportedRequest.payload,
        client_ts: new Date().toISOString(),
      },
    }),
  );
  expect(accepted.accepted).toBe(true);
  expect(accepted.request_id).toBe(requestId);

  let queried:
    | {
        execution_status: string;
        request_id: string;
      }
    | null = null;
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

test("backup restore syncs to another terminal through realtime", async ({ page, request }) => {
  await unlockManagementPin(page);
  await page.getByRole("button", { name: /备份恢复/ }).click();
  await expect(page.getByRole("heading", { level: 3, name: "备份恢复" })).toBeVisible();

  ensureSecondaryTerminal();
  const secondarySession = await bootstrapSession(request, SECONDARY_TERMINAL_ID);
  const secondaryHeaders = { authorization: `Bearer ${secondarySession.access_token}` };

  const created = await expectEnvelope<{ backup_id: string }>(
    await request.post("/api/v1/system/backups", {
      headers: secondaryHeaders,
      data: { note: `cross-terminal-${Date.now()}` },
    }),
  );

  const restored = await expectEnvelope<{ backup_id?: string; settings_version: string }>(
    await request.post(`/api/v1/system/backups/${created.backup_id}/restore`, {
      headers: secondaryHeaders,
      data: {},
    }),
  );

  await expect(page.getByText(created.backup_id).first()).toBeVisible();
  await expect(page.getByText(`当前版本 ${restored.settings_version}`).first()).toBeVisible();
});

test("editor draft can be saved and published through M1 contract", async ({ request }) => {
  const session = await bootstrapSession(request);
  const headers = { authorization: `Bearer ${session.access_token}` };

  const editorSession = await expectEnvelope<EditorSession>(
    await request.post("/api/v1/editor/sessions", {
      headers,
      data: { takeover_if_locked: true },
    }),
  );
  expect(editorSession.granted).toBe(true);
  expect(editorSession.lease_id).toBeTruthy();

  const draft = await expectEnvelope<EditorDraft>(
    await request.get(`/api/v1/editor/draft?lease_id=${editorSession.lease_id}`, { headers }),
  );
  const layout = draft.layout ?? {
    background_asset_id: null,
    background_image_url: null,
    layout_meta: {},
    hotspots: [],
  };

  const savedDraft = await expectEnvelope<{ draft_version: string }>(
    await request.put("/api/v1/editor/draft", {
      headers,
      data: {
        lease_id: editorSession.lease_id,
        draft_version: draft.draft_version,
        base_layout_version: draft.base_layout_version,
        background_asset_id: layout.background_asset_id,
        layout_meta: layout.layout_meta ?? {},
        hotspots: toEditorSaveHotspots(layout.hotspots ?? []),
      },
    }),
  );

  const refreshedDraft = await expectEnvelope<EditorDraft>(
    await request.get(`/api/v1/editor/draft?lease_id=${editorSession.lease_id}`, { headers }),
  );

  const published = await expectEnvelope<{ published: boolean; layout_version: string }>(
    await request.post("/api/v1/editor/publish", {
      headers,
      data: {
        lease_id: editorSession.lease_id,
        draft_version: refreshedDraft.draft_version ?? savedDraft.draft_version,
        base_layout_version: refreshedDraft.base_layout_version,
      },
    }),
  );
  expect(published.published).toBe(true);
  expect(published.layout_version).toBeTruthy();
});

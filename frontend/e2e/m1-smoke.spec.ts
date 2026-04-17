import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

const HOME_ID = "11111111-1111-1111-1111-111111111111";
const TERMINAL_ID = "22222222-2222-2222-2222-222222222222";
const SECONDARY_TERMINAL_ID = "33333333-3333-3333-3333-333333333333";
const DEV_PIN = "1234";

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
    background_image_url: string | null;
    layout_meta: Record<string, unknown>;
    hotspots: Array<{
      hotspot_id: string;
      device_id: string;
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

  let entryAction = "waiting";
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await saveButton.isEnabled()) {
      entryAction = "ready";
      break;
    }
    if (await takeoverButton.isEnabled()) {
      entryAction = "takeover";
      break;
    }
    if (await noticeTakeoverButton.isEnabled()) {
      entryAction = "notice-takeover";
      break;
    }
    if (await retryAcquireButton.isEnabled()) {
      entryAction = "retry-acquire";
      break;
    }
    if (await acquireButton.isEnabled()) {
      entryAction = "acquire";
      break;
    }
    await page.waitForTimeout(200);
  }
  expect(entryAction).not.toBe("waiting");

  if (entryAction === "takeover") {
    await takeoverButton.click();
    await expect(page.getByText(/已接管编辑租约|已接管终端 .* 的编辑租约/)).toBeVisible();
  } else if (entryAction === "notice-takeover") {
    await noticeTakeoverButton.click();
    await expect(page.getByText(/已接管编辑租约|已接管终端 .* 的编辑租约/)).toBeVisible();
  } else if (entryAction === "retry-acquire") {
    await retryAcquireButton.click();
    await expect(page.getByText("已获取编辑租约")).toBeVisible();
  } else if (entryAction === "acquire") {
    await acquireButton.click();
    await expect(page.getByText("已获取编辑租约")).toBeVisible();
  }

  await expect(saveButton).toBeEnabled();
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
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("草稿已保存")).toBeVisible();

  await expect(page.getByRole("button", { name: "发布草稿" })).toBeEnabled();
  await page.getByRole("button", { name: "发布草稿" }).click();
  await expect(page.getByText("草稿已发布")).toBeVisible();
  await expect(page.getByText(/布局版本已更新为/)).toBeVisible();
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
        background_asset_id: draft.layout?.background_image_url,
        layout_meta: draft.layout?.layout_meta ?? {},
        hotspots: draft.layout?.hotspots ?? [],
      },
    }),
  );

  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("保存前草稿版本已更新")).toBeVisible();
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
        background_asset_id: draft.layout?.background_image_url,
        layout_meta: draft.layout?.layout_meta ?? {},
        hotspots: draft.layout?.hotspots ?? [],
      },
    }),
  );

  await page.getByRole("button", { name: "发布草稿" }).click();
  await expect(page.getByText("发布前草稿版本已更新")).toBeVisible();
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

  const pageSettings = settings.page_settings;
  const functionSettings = settings.function_settings;
  const saved = await expectEnvelope<{ settings_version: string }>(
    await request.put("/api/v1/settings", {
      headers: { authorization: `Bearer ${session.access_token}` },
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

  await page.waitForFunction((settingsVersion) => {
    const events = (window as typeof window & { __m1WsEvents?: Array<Record<string, unknown>> })
      .__m1WsEvents;
    return events?.some((event) => {
      const payload = event.payload as Record<string, unknown> | undefined;
      return event.event_type === "settings_updated" && payload?.settings_version === settingsVersion;
    });
  }, saved.settings_version);
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
  const layout = draft.layout ?? { background_image_url: null, layout_meta: {}, hotspots: [] };

  const savedDraft = await expectEnvelope<{ draft_version: string }>(
    await request.put("/api/v1/editor/draft", {
      headers,
      data: {
        lease_id: editorSession.lease_id,
        draft_version: draft.draft_version,
        base_layout_version: draft.base_layout_version,
        background_asset_id: layout.background_image_url,
        layout_meta: layout.layout_meta ?? {},
        hotspots: layout.hotspots ?? [],
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

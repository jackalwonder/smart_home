import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

const HOME_ID = "11111111-1111-1111-1111-111111111111";
const TERMINAL_ID = "22222222-2222-2222-2222-222222222222";
const SECONDARY_TERMINAL_ID = "33333333-3333-3333-3333-333333333333";
const DEV_PIN = "1234";
const SMOKE_ROOM_ID = "11111111-1111-1111-1111-000000000010";
const SMOKE_DEVICE_ID = "11111111-1111-1111-1111-000000000101";
const BOOTSTRAP_TOKEN_STORAGE_KEY = "smart_home.bootstrap_token";
const TERMINAL_ACTIVATION_TEST = "terminal activation stores bootstrap token and enters shell";
const TERMINAL_ACTIVATION_LINK_TEST =
  "terminal activation link auto-activates and persists bootstrap token";
const TERMINAL_ACTIVATION_CODE_TEST =
  "terminal activation code can be pasted and persists bootstrap token";
const TERMINAL_PAIRING_TEST =
  "terminal pairing code can be claimed and auto-activates the terminal";
const DEVICE_SYNC_TIMEOUT_MS = 45_000;
const DEVICE_SYNC_POLL_INTERVAL_MS = 1_000;
const bootstrapTokens = new Map<string, string>();
const primedHomes = new Set<string>();
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

type SupportedControlRequest = {
  action_type: string;
  device_id: string;
  payload: {
    target_scope: string | null;
    target_key: string | null;
    value: unknown;
    unit: string | null;
  };
};

test.beforeEach(async ({ page }, testInfo) => {
  if (
    testInfo.title === TERMINAL_ACTIVATION_TEST ||
    testInfo.title === TERMINAL_ACTIVATION_LINK_TEST ||
    testInfo.title === TERMINAL_ACTIVATION_CODE_TEST ||
    testInfo.title === TERMINAL_PAIRING_TEST
  ) {
    return;
  }
  const token = issueBootstrapToken(TERMINAL_ID);
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: BOOTSTRAP_TOKEN_STORAGE_KEY, value: token },
  );
});

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

function successEnvelope<T>(data: T): Envelope<T> & { meta: { trace_id: string; server_time: string } } {
  return {
    success: true,
    data,
    error: null,
    meta: {
      trace_id: `e2e-${Date.now()}`,
      server_time: new Date().toISOString(),
    },
  };
}

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
  const bootstrapToken = issueBootstrapToken(terminalId);
  const session = await expectEnvelope<AuthSession>(
    await request.post("/api/v1/auth/session/bootstrap", {
      headers: { authorization: `Bootstrap ${bootstrapToken}` },
    }),
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

test(TERMINAL_ACTIVATION_TEST, async ({ page }) => {
  const token = issueBootstrapToken(TERMINAL_ID);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "激活这台中控" })).toBeVisible();
  await expect(page.getByText("Activate this terminal with a pairing code")).toBeVisible();
  await expect(page.getByText("Verify management PIN.")).toBeVisible();
  await expect(page.locator(".control-shell")).toHaveCount(0);

  await page.getByLabel("Bootstrap token").fill(token);
  await page.getByRole("button", { name: "激活终端" }).click();

  await expect(page.locator(".control-shell")).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), BOOTSTRAP_TOKEN_STORAGE_KEY))
    .toBe(token);
});

test(TERMINAL_ACTIVATION_LINK_TEST, async ({ page }) => {
  const token = issueBootstrapToken(TERMINAL_ID);

  await page.goto(`/?bootstrap_token=${encodeURIComponent(token)}`);

  await expect(page.locator(".control-shell")).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), BOOTSTRAP_TOKEN_STORAGE_KEY))
    .toBe(token);
  await expect.poll(() => page.evaluate(() => window.location.search)).toBe("");
});

test(TERMINAL_ACTIVATION_CODE_TEST, async ({ page }) => {
  const token = issueBootstrapToken(TERMINAL_ID);
  const activationCode = buildActivationCode(token);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "激活这台中控" })).toBeVisible();
  await expect(page.getByText("Manual recovery")).toBeVisible();

  await page.locator("#bootstrap-token").fill(activationCode);
  await page.getByRole("button", { name: "激活终端" }).click();

  await expect(page.locator(".control-shell")).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), BOOTSTRAP_TOKEN_STORAGE_KEY))
    .toBe(token);
});

test(TERMINAL_PAIRING_TEST, async ({ page, request }) => {
  ensureSecondaryTerminal();
  clearPairingSessions(TERMINAL_ID);

  await page.goto("/");
  await expect(page.getByText("Claim this code from Pairing claim.")).toBeVisible();
  await expect
    .poll(async () => (await page.getByTestId("pairing-code-value").textContent())?.trim() ?? "")
    .not.toBe("Loading...");
  const pairingCode = ((await page.getByTestId("pairing-code-value").textContent()) ?? "").trim();
  expect(pairingCode).toBeTruthy();
  expect(pairingCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const secondarySession = await bootstrapSession(request, SECONDARY_TERMINAL_ID);
  await expectEnvelope(
    await request.post("/api/v1/terminals/pairing-code-claims", {
      headers: { authorization: `Bearer ${secondarySession.access_token}` },
      data: {
        pairing_code: pairingCode,
      },
    }),
  );

  await expect(page.locator(".control-shell")).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), BOOTSTRAP_TOKEN_STORAGE_KEY))
    .not.toBeNull();
  const activatedToken = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    BOOTSTRAP_TOKEN_STORAGE_KEY,
  );
  expect(activatedToken).toBeTruthy();
  bootstrapTokens.set(TERMINAL_ID, activatedToken as string);
});

function issueBootstrapToken(terminalId = TERMINAL_ID) {
  const cached = bootstrapTokens.get(terminalId);
  if (cached) {
    return cached;
  }

  const output = execFileSync(
    "docker",
    [
      "compose",
      "-f",
      "../docker-compose.yml",
      "exec",
      "-T",
      "backend",
      "python",
      "scripts/issue_bootstrap_token.py",
      "--home-id",
      HOME_ID,
      "--terminal-id",
      terminalId,
      "--created-by-terminal-id",
      terminalId,
    ],
    { cwd: process.cwd(), encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const token = output
    .trim()
    .split(/\r?\n/)
    .find((line) => line.startsWith("bootstrap_token="))
    ?.slice("bootstrap_token=".length)
    .trim();
  if (!token) {
    throw new Error(`Failed to issue bootstrap token for ${terminalId}`);
  }
  bootstrapTokens.set(terminalId, token);
  return token;
}

function buildActivationCode(token: string) {
  return `smart-home-activate:${token}`;
}

function seedSmokeDeviceFixture() {
  if (primedHomes.has(HOME_ID)) {
    return;
  }

  const script = [
    "import os",
    "import psycopg",
    `HOME_ID = ${JSON.stringify(HOME_ID)}`,
    `ROOM_ID = ${JSON.stringify(SMOKE_ROOM_ID)}`,
    `DEVICE_ID = ${JSON.stringify(SMOKE_DEVICE_ID)}`,
    "db_url = os.environ.get('DATABASE_URL', 'postgresql://smart_home:smart_home@postgres:5432/smart_home').replace('postgresql+psycopg://', 'postgresql://')",
    "conn = psycopg.connect(db_url)",
    "conn.autocommit = True",
    "with conn.cursor() as cur:",
    "    cur.execute(\"\"\"",
    "        INSERT INTO rooms (id, home_id, room_name, priority, visible_in_editor, sort_order)",
    "        VALUES (%s, %s, %s, 0, true, 0)",
    "        ON CONFLICT (id) DO UPDATE",
    "        SET room_name = EXCLUDED.room_name,",
    "            visible_in_editor = EXCLUDED.visible_in_editor,",
    "            sort_order = EXCLUDED.sort_order,",
    "            updated_at = now()",
    "    \"\"\", (ROOM_ID, HOME_ID, 'E2E 客厅'))",
    "    cur.execute(\"\"\"",
    "        INSERT INTO devices (",
    "            id, home_id, room_id, display_name, raw_name, device_type,",
    "            is_complex_device, is_readonly_device, confirmation_type, entry_behavior,",
    "            default_control_target, is_primary_device, is_homepage_visible,",
    "            capabilities_json, source_meta_json)",
    "        VALUES (",
    "            %s, %s, %s, %s, %s, %s,",
    "            false, false, 'ACK_DRIVEN', 'OPEN_CONTROL_CARD',",
    "            'PRIMARY', true, true,",
    "            %s::jsonb, %s::jsonb)",
    "        ON CONFLICT (id) DO UPDATE",
    "        SET room_id = EXCLUDED.room_id,",
    "            display_name = EXCLUDED.display_name,",
    "            raw_name = EXCLUDED.raw_name,",
    "            device_type = EXCLUDED.device_type,",
    "            confirmation_type = EXCLUDED.confirmation_type,",
    "            entry_behavior = EXCLUDED.entry_behavior,",
    "            default_control_target = EXCLUDED.default_control_target,",
    "            is_primary_device = EXCLUDED.is_primary_device,",
    "            is_homepage_visible = EXCLUDED.is_homepage_visible,",
    "            capabilities_json = EXCLUDED.capabilities_json,",
    "            source_meta_json = EXCLUDED.source_meta_json,",
    "            updated_at = now()",
    "    \"\"\", (",
    "        DEVICE_ID, HOME_ID, ROOM_ID, 'E2E 客厅主灯', 'E2E 客厅主灯', 'LIGHT',",
    "        '{\"power\": true}', '{\"fixture\": \"e2e\"}')",
    "    )",
    "    cur.execute(\"\"\"",
    "        INSERT INTO device_runtime_states (",
    "            device_id, home_id, status, is_offline, status_summary_json, runtime_state_json,",
    "            aggregated_state, aggregated_mode, aggregated_position, last_state_update_at, updated_at)",
    "        VALUES (",
    "            %s, %s, 'ONLINE', false, %s::jsonb, %s::jsonb,",
    "            'ON', NULL, NULL, now(), now())",
    "        ON CONFLICT (device_id) DO UPDATE",
    "        SET status = EXCLUDED.status,",
    "            is_offline = EXCLUDED.is_offline,",
    "            status_summary_json = EXCLUDED.status_summary_json,",
    "            runtime_state_json = EXCLUDED.runtime_state_json,",
    "            aggregated_state = EXCLUDED.aggregated_state,",
    "            last_state_update_at = EXCLUDED.last_state_update_at,",
    "            updated_at = now()",
    "    \"\"\", (DEVICE_ID, HOME_ID, '{\"primary\": \"在线\"}', '{\"power\": true}'))",
    "    cur.execute(\"\"\"",
    "        INSERT INTO device_control_schemas (",
    "            id, device_id, action_type, target_scope, target_key, value_type,",
    "            value_range_json, allowed_values_json, unit, is_quick_action,",
    "            requires_detail_entry, sort_order)",
    "        VALUES (gen_random_uuid(), %s, 'TOGGLE_POWER', 'PRIMARY', 'power', 'BOOLEAN',",
    "            NULL, NULL, NULL, true, false, 0)",
    "        ON CONFLICT (device_id, action_type, target_scope, target_key) DO UPDATE",
    "        SET value_type = EXCLUDED.value_type,",
    "            is_quick_action = EXCLUDED.is_quick_action,",
    "            requires_detail_entry = EXCLUDED.requires_detail_entry,",
    "            sort_order = EXCLUDED.sort_order,",
    "            updated_at = now()",
    "    \"\"\", (DEVICE_ID,))",
    "conn.close()",
  ].join("\n");

  execFileSync("docker", ["compose", "exec", "-T", "backend", "python", "-c", script], {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
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

async function tryFindSupportedControlRequest(
  request: APIRequestContext,
  accessToken: string,
): Promise<SupportedControlRequest | null> {
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

async function ensureDevicesReady(
  request: APIRequestContext,
  accessToken: string,
): Promise<SupportedControlRequest> {
  if (primedHomes.has(HOME_ID)) {
    const supported = await tryFindSupportedControlRequest(request, accessToken);
    if (supported) {
      return supported;
    }
    primedHomes.delete(HOME_ID);
  }

  seedSmokeDeviceFixture();
  const headers = { authorization: `Bearer ${accessToken}` };

  const deadline = Date.now() + DEVICE_SYNC_TIMEOUT_MS;
  let lastKnownState = "device catalog still empty";
  while (Date.now() < deadline) {
    const supported = await tryFindSupportedControlRequest(request, accessToken);
    if (supported) {
      primedHomes.add(HOME_ID);
      return supported;
    }

    const catalog = await expectEnvelope<{ items: Array<{ device_id: string }> }>(
      await request.get("/api/v1/devices?page=1&page_size=50", { headers }),
    );
    lastKnownState =
      catalog.items.length === 0
        ? "device catalog still empty"
        : `device catalog has ${catalog.items.length} device(s), but no controllable schema yet`;
    await new Promise((resolve) => setTimeout(resolve, DEVICE_SYNC_POLL_INTERVAL_MS));
  }

  throw new Error(`No supported controllable device found for smoke test: ${lastKnownState}`);
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

function clearPairingSessions(terminalId: string) {
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
        "UPDATE terminal_pairing_code_sessions",
        "SET invalidated_at = now(), updated_at = now()",
        `WHERE terminal_id = '${terminalId}'`,
        "AND invalidated_at IS NULL",
        "AND completed_at IS NULL",
        "AND claimed_at IS NULL;",
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

test("settings can rotate bootstrap token and revoke the previous token", async ({
  page,
  request,
}) => {
  const previousToken = issueBootstrapToken(TERMINAL_ID);

  await unlockManagementPin(page);
  await page.locator(".settings-side-nav__item").nth(1).click();
  await expect(page.getByRole("heading", { level: 3, name: "Bootstrap token" })).toBeVisible();

  await page.getByRole("button", { name: "重置 bootstrap token" }).click();
  await expect(page.getByRole("heading", { level: 4, name: "本次签发结果" })).toBeVisible();

  const revealedToken = await page
    .locator("section[aria-label='bootstrap token reveal'] textarea")
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

test("editor UI opens an edit session, saves draft, and publishes", async ({ page, request }) => {
  const session = await bootstrapSession(request);
  await ensureDevicesReady(request, session.access_token);

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
  await expect
    .poll(async () => deviceSelect.locator("option").count(), {
      message: "waiting for bindable devices to appear in the editor",
    })
    .toBeGreaterThan(1);
  const deviceOptionText = (await deviceSelect.locator("option").nth(1).textContent())?.trim() ?? "";
  const deviceLabel = deviceOptionText.split(" · ")[0];
  const customLabel = `E2E 热点 ${Date.now()}`;
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
  await expect(page.getByLabel("发布前变更摘要")).toContainText("背景图更新");
  await expect(page.getByText(customLabel).first()).toBeVisible();
  await page.getByRole("button", { name: "首页预览" }).click();
  await expect(page.getByText("首页预览仅显示可见热点。")).toBeVisible();
  await expect(page.getByRole("button", { name: customLabel }).first()).toBeVisible();

  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("草稿已保存")).toBeVisible();
  await expect(page.getByLabel("发布前变更摘要")).toContainText("新增热点");

  await expect(page.getByRole("button", { name: "发布草稿" })).toBeEnabled();
  await page.getByRole("button", { name: "发布草稿" }).click();
  await expect(page.getByText("草稿已发布")).toBeVisible();
  await expect(page.getByText(/布局版本已更新为/)).toBeVisible();

  await page.getByRole("link", { name: "总览" }).click();
  await expect(page.getByAltText("家庭户型图")).toBeVisible();
  await expect(page.getByRole("button", { name: customLabel }).first()).toBeVisible();
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
  const supportedRequest = await ensureDevicesReady(request, session.access_token);
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

test("home control UI sends null payload for no-value actions and shows result", async ({ page }) => {
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
  await page.getByRole("link", { name: "总览" }).click();
  await page.getByRole("button", { name: "无值测试开关" }).click();
  await expect(page.getByRole("heading", { name: "无值测试开关" })).toBeVisible();
  await expect(page.getByText("这个动作不需要输入取值，发送时会使用空值。")).toBeVisible();
  await page.getByRole("button", { name: "发送控制" }).click();
  await expect(page.getByText("Control request accepted")).toBeVisible();
  await expect(page.getByText("控制已完成")).toBeVisible();

  expect(postedBody).toBeTruthy();
  expect((postedBody?.payload as { value?: unknown } | undefined)?.value).toBeNull();
  expect((postedBody?.payload as { target_key?: unknown } | undefined)?.target_key).toBe("button.trigger");
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

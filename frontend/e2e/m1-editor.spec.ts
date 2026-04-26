import { expect, test, type Locator } from "@playwright/test";
import {
  installSmokeBootstrapHook,
  bootstrapSession,
  ensureDevicesReady,
  unlockManagementPin,
  openEditorWorkspace,
  ensureEditorWritable,
  WIDE_PNG,
  TINY_PNG,
  escapeRegExp,
  openHomeDashboard,
  ensureSecondaryTerminal,
  SECONDARY_TERMINAL_ID,
  expectEnvelope,
  HOME_ID,
  readEditorFieldValue,
  toEditorSaveHotspots,
  type EditorDraft,
  type EditorSession,
} from "./support/smokeHelpers";

installSmokeBootstrapHook();

test("editor UI opens an edit session, saves draft, and publishes", async ({
  page,
  request,
}) => {
  async function centerInContainer(subject: Locator, container: Locator) {
    await expect(subject).toBeVisible();
    const [subjectBox, containerBox] = await Promise.all([
      subject.boundingBox(),
      container.boundingBox(),
    ]);
    expect(subjectBox).toBeTruthy();
    expect(containerBox).toBeTruthy();
    if (!subjectBox || !containerBox) {
      throw new Error("Unable to resolve geometry for hotspot alignment check");
    }
    return {
      x: (subjectBox.x + subjectBox.width / 2 - containerBox.x) / containerBox.width,
      y: (subjectBox.y + subjectBox.height / 2 - containerBox.y) / containerBox.height,
    };
  }

  function canvasHotspotByLabel(label: string) {
    return page.locator(".editor-selection-layer__item").filter({
      has: page.locator(".editor-selection-layer__title").filter({
        hasText: new RegExp(`^${escapeRegExp(label)}$`),
      }),
    });
  }

  const session = await bootstrapSession(request);
  await ensureDevicesReady(request, session.access_token);

  await unlockManagementPin(page);
  await openEditorWorkspace(page);
  await ensureEditorWritable(page);

  await page.getByLabel("上传背景图").setInputFiles({
    name: "floorplan-smoke.png",
    mimeType: "image/png",
    buffer: WIDE_PNG,
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
    buffer: WIDE_PNG,
  });
  await expect(page.getByText("背景图已更新")).toBeVisible();

  await page.getByRole("button", { name: "新增热点" }).click();
  const deviceSelect = page.getByLabel("绑定设备");
  await expect
    .poll(async () => deviceSelect.locator("option").count(), {
      message: "waiting for bindable devices to appear in the editor",
    })
    .toBeGreaterThan(1);
  const customLabel = `E2E 热点 ${Date.now()}`;
  await deviceSelect.selectOption({ index: 1 });
  await page.getByLabel("显示名称").fill(customLabel);
  await page.getByRole("button", { name: "Use Light icon" }).click();
  await page.getByLabel("X (%)").fill("35");
  await page.getByLabel("Y (%)").fill("45");
  const canvasHotspot = canvasHotspotByLabel(customLabel).first();
  await expect(
    canvasHotspot.locator(".editor-selection-layer__badge .hotspot-icon svg"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use Fridge icon" }).click();
  await expect(
    canvasHotspot.locator(
      ".editor-selection-layer__badge .hotspot-icon[data-icon-key='refrigerator'] svg",
    ),
  ).toBeVisible();
  const hotspotIconUpload = page.locator(".editor-hotspot-icon-picker input[type='file']");
  await hotspotIconUpload.setInputFiles({
    name: "hotspot-icon-smoke.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await expect(page.getByText("Hotspot icon uploaded")).toBeVisible();
  await expect(
    canvasHotspot.locator(".editor-selection-layer__badge .hotspot-icon.has-custom-icon img"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use built-in icon" }).click();
  await expect(
    canvasHotspot.locator(
      ".editor-selection-layer__badge .hotspot-icon[data-icon-key='refrigerator'] svg",
    ),
  ).toBeVisible();
  const editorFrame = page.locator(".editor-canvas-workspace__hotspot-frame");
  await page.getByRole("button", { name: "右移 1%" }).click();
  await page.getByRole("button", { name: "下移 1%" }).click();
  await page.getByRole("button", { name: "复制热点" }).click();
  await page.getByRole("button", { name: "全选当前" }).click();
  await expect(page.getByRole("button", { name: "左对齐" })).toBeEnabled();
  const hotspotBox = await canvasHotspot.boundingBox();
  expect(hotspotBox).toBeTruthy();
  if (!hotspotBox) {
    throw new Error("Canvas hotspot not found");
  }
  await page.mouse.move(
    hotspotBox.x + hotspotBox.width / 2,
    hotspotBox.y + hotspotBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    hotspotBox.x + hotspotBox.width / 2 + 40,
    hotspotBox.y + hotspotBox.height / 2 + 30,
    {
      steps: 8,
    },
  );
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
  const editAnchor = page
    .locator(".editor-selection-layer__item")
    .filter({
      has: page.locator(".editor-selection-layer__title").filter({
        hasText: new RegExp(`^${escapeRegExp(customLabel)}$`),
      }),
    })
    .first()
    .locator(".editor-selection-layer__badge");
  const editCenter = await centerInContainer(editAnchor, editorFrame);
  await page.getByRole("button", { name: "首页预览" }).click();
  await expect(page.getByText("首页预览仅显示可见热点。")).toBeVisible();
  await expect(page.getByRole("button", { name: customLabel }).first()).toBeVisible();
  await expect(
    page
      .locator(".editor-selection-layer__item", { hasText: customLabel })
      .first()
      .locator(
        ".editor-selection-layer__badge .hotspot-icon[data-icon-key='refrigerator'] svg",
      ),
  ).toBeVisible();
  const editorPreviewAnchor = page
    .locator(".editor-selection-layer__item")
    .filter({
      has: page.locator(".editor-selection-layer__title").filter({
        hasText: new RegExp(`^${escapeRegExp(customLabel)}$`),
      }),
    })
    .first()
    .locator(".editor-selection-layer__badge");
  const editorPreviewCenter = await centerInContainer(editorPreviewAnchor, editorFrame);
  expect(Math.abs(editCenter.x - editorPreviewCenter.x)).toBeLessThan(0.01);
  expect(Math.abs(editCenter.y - editorPreviewCenter.y)).toBeLessThan(0.01);

  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("草稿已保存")).toBeVisible();
  await expect(page.getByLabel("发布前变更摘要")).toContainText("新增热点");

  await expect(page.getByRole("button", { name: "发布到首页" })).toBeEnabled();
  await page.getByRole("button", { name: "发布到首页" }).click();
  await expect(page.getByText("草稿已发布")).toBeVisible();
  await expect(page.getByText(/布局版本已更新为/)).toBeVisible();

  await openHomeDashboard(page);
  await expect(page.getByAltText("家庭户型图")).toBeVisible();
  await expect(page.getByRole("button", { name: customLabel }).first()).toBeVisible();
  const homeFrame = page.locator(".home-command-stage__hotspot-frame");
  const homeAnchor = page.locator(
    `.home-hotspot-overlay__item[aria-label="${customLabel}"] .home-hotspot-overlay__dot`,
  );
  const homeCenter = await centerInContainer(homeAnchor, homeFrame);
  expect(Math.abs(editorPreviewCenter.x - homeCenter.x)).toBeLessThan(0.01);
  expect(Math.abs(editorPreviewCenter.y - homeCenter.y)).toBeLessThan(0.01);
});

test("editor downgrades to readonly after takeover and can recover", async ({
  page,
  request,
}) => {
  await unlockManagementPin(page);
  await openEditorWorkspace(page);
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

test("editor save surfaces version conflict and retries after refresh", async ({
  page,
  request,
}) => {
  await unlockManagementPin(page);
  await openEditorWorkspace(page);
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
  await expect(
    page.getByText(new RegExp(`本次提交基于 ${draft.draft_version}`)),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "重新保存" })).toBeVisible();
  await page.getByRole("button", { name: "重新保存" }).click();
  await expect(page.getByText("草稿已保存")).toBeVisible();
});

test("editor publish surfaces version conflict and retries after refresh", async ({
  page,
  request,
}) => {
  await unlockManagementPin(page);
  await openEditorWorkspace(page);
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

  await page.getByRole("button", { name: "发布到首页" }).click();
  await expect(page.getByText("发布前草稿版本已更新")).toBeVisible();
  await expect(
    page.getByText(new RegExp(`本次提交基于 ${draft.draft_version}`)),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "重新发布" })).toBeVisible();
  await page.getByRole("button", { name: "重新发布" }).click();
  await expect(page.getByText("草稿已发布")).toBeVisible();
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

  const published = await expectEnvelope<{
    published: boolean;
    layout_version: string;
  }>(
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

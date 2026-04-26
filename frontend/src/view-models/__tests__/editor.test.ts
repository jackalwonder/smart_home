import { describe, expect, it } from "vitest";
import type { EditorDraftLayoutDto } from "../../api/types";
import { mapEditorViewModel } from "../editor";

const draftFixture: EditorDraftLayoutDto = {
  background_asset_id: "asset-1",
  background_image_size: { width: 1280, height: 720 },
  background_image_url: "/api/v1/page-assets/asset-1/file",
  hotspots: [
    {
      device_id: "light-1",
      display_name: "客厅灯",
      hotspot_id: "hotspot-1",
      icon_asset_id: null,
      icon_asset_url: null,
      icon_type: "light",
      is_visible: true,
      label_mode: "ALWAYS",
      structure_order: 1,
      x: 0.25,
      y: 0.5,
    },
  ],
  layout_meta: { theme: "night" },
};

describe("editor view model", () => {
  it("maps a typed draft layout fixture", () => {
    const viewModel = mapEditorViewModel({
      baseLayoutVersion: "layout-v1",
      draft: draftFixture,
      draftVersion: "draft-v1",
      events: [],
      heartbeatIntervalSeconds: 15,
      leaseExpiresAt: "2026-04-26T10:15:00Z",
      leaseId: "lease-1",
      lockStatus: "GRANTED",
      lockedByTerminalId: null,
      pinActive: true,
      readonly: false,
    });

    expect(viewModel.modeLabel).toBe("租约已获取");
    expect(viewModel.hotspots).toEqual([
      expect.objectContaining({
        deviceId: "light-1",
        id: "hotspot-1",
        label: "客厅灯",
      }),
    ]);
    expect(viewModel.backgroundImageSize).toEqual({ width: 1280, height: 720 });
    expect(viewModel.layoutMeta).toEqual({ theme: "night" });
  });

  it("keeps readonly lock copy stable when no typed draft exists", () => {
    const viewModel = mapEditorViewModel({
      baseLayoutVersion: null,
      draft: null,
      draftVersion: null,
      events: [],
      heartbeatIntervalSeconds: null,
      leaseExpiresAt: null,
      leaseId: null,
      lockStatus: "READ_ONLY",
      lockedByTerminalId: null,
      pinActive: true,
      readonly: true,
    });

    expect(viewModel.modeLabel).toBe("只读预览");
    expect(viewModel.helperText).toContain("只读快照");
    expect(viewModel.hotspots).toEqual([]);
  });
});

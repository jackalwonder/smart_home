import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { fetchDeviceDetail, fetchDevices, fetchRooms } from "../../api/devicesApi";
import { DevicesCatalogPage } from "../DevicesCatalogPage";

vi.mock("../../api/devicesApi", () => ({
  fetchDeviceDetail: vi.fn(),
  fetchDevices: vi.fn(),
  fetchRooms: vi.fn(),
}));

vi.mock("../../api/settingsApi", () => ({
  fetchSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

const deviceListItem = {
  alert_badges: [],
  capabilities: {},
  confirmation_type: null,
  default_control_target: null,
  device_id: "yunmai-cn-blt-3-1n482ua8s4k01-ms107",
  device_type: "SCALE",
  display_name: "米家体脂秤 S400 蓝色",
  favorite_exclude_reason: null,
  favorite_order: null,
  home_entry_enabled: false,
  is_complex_device: false,
  is_favorite: false,
  is_favorite_candidate: true,
  is_homepage_visible: false,
  is_offline: false,
  is_primary_device: false,
  is_readonly_device: false,
  raw_name: "yunmai.scales.ms107",
  room_id: "bedroom",
  room_name: "主卧",
  status: "unknown",
  status_summary: undefined,
};

const deviceDetail = {
  ...deviceListItem,
  control_schema: [
    {
      action_type: "EXECUTE_ACTION",
      allowed_values: [],
      is_quick_action: false,
      requires_detail_entry: false,
      target_key: "button.yunmai_cn_blt_3_1n482ua8s4k01_ms107_wakeup_device_a_10_1",
      target_scope: "PRIMARY",
      unit: null,
      value_range: null,
      value_type: "NONE",
    },
  ],
  editor_config: { hotspots: [] },
  runtime_state: {
    aggregated_state: "unknown",
    last_state_update_at: "2026-04-24T12:30:00Z",
    telemetry: {
      raw_control_schema: "control_schema",
    },
  },
  source_info: {
    entity_links: [
      {
        domain: "button",
        entity_id: "button.yunmai_cn_blt_3_1n482ua8s4k01_ms107_wakeup_device_a_10_1",
        entity_role: "PRIMARY_CONTROL",
        is_available: true,
        is_primary: true,
        platform: "xiaomi",
        state: "unknown",
      },
      {
        domain: "notify",
        entity_id: "notify.yunmai_cn_blt_3_1n482ua8s4k01_ms107_update_user_a_6_1",
        entity_role: "SECONDARY_CONTROL",
        is_available: true,
        is_primary: false,
        platform: "xiaomi",
        state: "unknown",
      },
    ],
  },
};

beforeEach(() => {
  vi.mocked(fetchRooms).mockResolvedValue({
    rooms: [
      {
        device_count: 1,
        homepage_device_count: 0,
        priority: 0,
        room_id: "bedroom",
        room_name: "主卧",
        visible_in_editor: true,
      },
    ],
  });
  vi.mocked(fetchDevices).mockResolvedValue({
    items: [deviceListItem],
    page_info: {
      has_next: false,
      page: 1,
      page_size: 200,
      total: 1,
    },
  });
  vi.mocked(fetchDeviceDetail).mockResolvedValue(deviceDetail as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DevicesCatalogPage", () => {
  it("keeps raw control schema and HA entity ids out of the visible detail sections", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/devices"]}>
        <DevicesCatalogPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("米家体脂秤 S400 蓝色")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "详情" }));

    await waitFor(() => {
      expect(fetchDeviceDetail).toHaveBeenCalledWith(deviceListItem.device_id);
    });
    expect((await screen.findAllByText("可控能力")).length).toBeGreaterThan(0);

    const drawer = container.querySelector(".devices-detail-drawer__body");
    expect(drawer).not.toBeNull();
    const visibleDetailText = Array.from(
      drawer!.querySelectorAll(
        ".devices-detail-section:not(.devices-detail-section--technical)",
      ),
    )
      .map((element) => element.textContent ?? "")
      .join("\n");

    expect(visibleDetailText).toContain("作用对象：主操作");
    expect(visibleDetailText).toContain("可选值：无需输入");
    expect(visibleDetailText).toContain("实体标识：...");
    expect(visibleDetailText).toContain("用途：主控制");
    expect(visibleDetailText).not.toContain("control_schema");
    expect(visibleDetailText).not.toContain("NONE");
    expect(visibleDetailText).not.toContain("button.yunmai");
    expect(visibleDetailText).not.toContain("notify.yunmai");
    expect(screen.getByText("技术诊断")).toBeTruthy();
  });
});

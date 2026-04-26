import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceDetailDto, DeviceListItemDto } from "../../../api/types";
import { HomeClusterControlModal } from "../HomeClusterControlModal";

const mocks = vi.hoisted(() => ({
  control: null as unknown as ReturnType<
    typeof import("../useDeviceControlFlow").useDeviceControlFlow
  >,
}));

vi.mock("../useDeviceControlFlow", () => ({
  useDeviceControlFlow: vi.fn(() => mocks.control),
}));

function device(overrides: Partial<DeviceListItemDto> = {}): DeviceListItemDto {
  return {
    alert_badges: [],
    device_id: "light-1",
    device_type: "light",
    display_name: "客厅主灯",
    favorite_order: null,
    home_entry_enabled: true,
    is_complex_device: false,
    is_offline: false,
    is_readonly_device: false,
    room_id: "room-1",
    room_name: "客厅",
    status: "off",
    status_summary: null,
    ...overrides,
  } as DeviceListItemDto;
}

function detail(overrides: Partial<DeviceDetailDto> = {}): DeviceDetailDto {
  return {
    ...device(),
    control_schema: [
      {
        action_type: "toggle_power",
        target_key: "switch.light_1",
        target_scope: "ENTITY",
        unit: null,
        value_type: "BOOLEAN",
      },
      {
        action_type: "set_brightness",
        target_key: "brightness",
        target_scope: "ENTITY",
        unit: "%",
        value_range: { min: 0, max: 100, step: 10 },
        value_type: "NUMBER",
      },
    ],
    runtime_state: { aggregated_state: "off" },
    ...overrides,
  } as unknown as DeviceDetailDto;
}

function makeControl(overrides: Partial<typeof mocks.control> = {}) {
  const submitControl = vi.fn();
  const setValue = vi.fn();
  const setValues = vi.fn();
  const loadedDetail = detail();
  mocks.control = {
    acceptedByDeviceId: {},
    controlKey: (deviceId, schema, schemaIndex) =>
      `${deviceId}:${schema.action_type}:${schema.target_key ?? ""}:${schemaIndex}`,
    details: [loadedDetail],
    error: null,
    loading: false,
    messageByDeviceId: { "light-1": "设备已完成控制" },
    pendingByKey: {},
    resultByDeviceId: {},
    setValue,
    setValues,
    submitControl,
    values: {
      "light-1:set_brightness:brightness:1": 40,
    },
    ...overrides,
  };
  return { control: mocks.control, loadedDetail, setValue, setValues, submitControl };
}

beforeEach(() => {
  vi.clearAllMocks();
  makeControl();
});

afterEach(() => {
  cleanup();
});

describe("HomeClusterControlModal", () => {
  it("renders cluster devices and delegates power/range controls to the shared flow", () => {
    const { loadedDetail, submitControl } = makeControl();

    render(
      <HomeClusterControlModal cluster="lights" devices={[device()]} onClose={vi.fn()} open />,
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("全屋灯光")).toBeTruthy();
    expect(within(dialog).getByText("客厅主灯")).toBeTruthy();
    expect(within(dialog).getByText("设备已完成控制")).toBeTruthy();

    fireEvent.click(within(dialog).getByText("开启"));
    expect(submitControl).toHaveBeenCalledWith({
      detail: loadedDetail,
      overrideValue: true,
      schema: loadedDetail.control_schema[0],
      schemaIndex: 0,
    });

    fireEvent.click(within(dialog).getByText("应用"));
    expect(submitControl).toHaveBeenCalledWith({
      detail: loadedDetail,
      schema: loadedDetail.control_schema[1],
      schemaIndex: 1,
    });
  });

  it("keeps offline and battery clusters as readonly device cards", () => {
    makeControl({ details: [], messageByDeviceId: {} });

    render(
      <HomeClusterControlModal
        cluster="battery"
        devices={[
          device({
            alert_badges: [{ code: "LOW_BATTERY", level: "warning", text: "低电量" }],
            device_id: "sensor-1",
            device_type: "sensor",
            display_name: "门磁",
          }),
        ]}
        onClose={vi.fn()}
        open
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("低电量设备")).toBeTruthy();
    expect(within(dialog).getByText("门磁")).toBeTruthy();
    expect(within(dialog).getAllByText("低电量").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("开启")).toBeNull();
  });
});

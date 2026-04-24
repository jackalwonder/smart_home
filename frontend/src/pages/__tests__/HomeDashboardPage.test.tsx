import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { DeviceListItemDto, SessionModel } from "../../api/types";
import { fetchDevices } from "../../api/devicesApi";
import { appStore } from "../../store/useAppStore";
import { HomeDashboardPage } from "../HomeDashboardPage";

vi.mock("../../api/homeApi", () => ({
  fetchHomeOverview: vi.fn(async () => ({
    favorite_devices: [
      {
        device_id: "fridge-1",
        device_type: "climate",
        display_name: "米家对开门冰箱",
        is_complex_device: false,
        is_offline: false,
        is_readonly_device: false,
        room_name: "厨房",
        status: "on",
      },
    ],
    stage: { hotspots: [] },
  })),
}));

vi.mock("../../api/devicesApi", () => ({
  fetchDeviceDetail: vi.fn(),
  fetchDevices: vi.fn(),
}));

vi.mock("../../components/home/HomeHotspotControlModal", () => ({
  HomeHotspotControlModal: ({
    hotspot,
    mode,
    open,
  }: {
    hotspot: { label: string } | null;
    mode: string;
    open: boolean;
  }) =>
    open && hotspot ? (
      <div data-testid="hotspot-control-modal">{`${mode}:${hotspot.label}`}</div>
    ) : null,
}));

function setReadySession() {
  appStore.setSessionData({
    accessToken: "token",
    accessTokenExpiresAt: null,
    features: {
      energy_enabled: true,
      editor_enabled: true,
      music_enabled: true,
    },
    homeId: "home",
    loginMode: "terminal",
    operatorId: null,
    pinSessionActive: true,
    pinSessionExpiresAt: null,
    terminalId: "terminal",
    terminalMode: "activated",
  } as SessionModel);
  appStore.setPinState({
    active: true,
    expiresAt: null,
    remainingLockSeconds: 0,
  });
  appStore.setRealtimeState({ connectionStatus: "connected" });
}

function makeDevice(overrides: Partial<DeviceListItemDto> = {}): DeviceListItemDto {
  return {
    alert_badges: [],
    device_id: "fridge-1",
    device_type: "climate",
    display_name: "米家对开门冰箱",
    favorite_order: null,
    home_entry_enabled: false,
    is_complex_device: false,
    is_offline: false,
    is_readonly_device: false,
    room_id: null,
    room_name: "厨房",
    status: "on",
    status_summary: null,
    ...overrides,
  } as DeviceListItemDto;
}

function mockDeviceDirectory(devices: DeviceListItemDto[]) {
  vi.mocked(fetchDevices).mockResolvedValue({
    items: devices,
    page_info: {
      has_next: false,
      page: 1,
      page_size: 200,
      total: devices.length,
    },
  });
}

beforeEach(() => {
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  vi.clearAllMocks();
  mockDeviceDirectory([makeDevice()]);
  setReadySession();
});

afterEach(() => {
  cleanup();
});

describe("HomeDashboardPage", () => {
  it("opens the same hotspot detail modal from a favorite device", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <HomeDashboardPage />
      </MemoryRouter>,
    );

    const favoriteLabel = await screen.findByText("米家对开门冰箱");
    const favoriteButton = favoriteLabel.closest("button");
    expect(favoriteButton).not.toBeNull();
    fireEvent.click(favoriteButton!);

    await waitFor(() => {
      expect(screen.getByTestId("hotspot-control-modal").textContent).toBe(
        "detail:米家对开门冰箱",
      );
    });
    expect(container.querySelector(".home-device-control-panel")).toBeNull();
  });

  it("opens the hotspot detail modal from the climate quick entry", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <HomeDashboardPage />
      </MemoryRouter>,
    );

    const climateLabel = await screen.findByText("温控");
    const climateButton = climateLabel.closest("button");
    expect(climateButton).not.toBeNull();
    fireEvent.click(climateButton!);

    await waitFor(() => {
      expect(screen.getByTestId("hotspot-control-modal").textContent).toBe(
        "detail:米家对开门冰箱",
      );
    });
    expect(
      container.querySelector(
        ".home-cluster-modal__panel.is-climate:not(.home-climate-picker__panel)",
      ),
    ).toBeNull();
  });

  it("shows a climate device picker when multiple climate devices exist", async () => {
    mockDeviceDirectory([
      makeDevice(),
      makeDevice({
        device_id: "ac-1",
        device_type: "air_conditioner",
        display_name: "客厅空调",
        is_offline: true,
        is_readonly_device: true,
        room_name: "客厅",
        status: "off",
      }),
    ]);

    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <HomeDashboardPage />
      </MemoryRouter>,
    );

    const climateLabel = await screen.findByText("温控");
    const climateButton = climateLabel.closest("button");
    expect(climateButton).not.toBeNull();
    fireEvent.click(climateButton!);

    const picker = await screen.findByRole("dialog", { name: "全屋温控" });
    expect(within(picker).getByText("全屋温控")).toBeTruthy();
    expect(within(picker).getByText("米家对开门冰箱")).toBeTruthy();
    expect(within(picker).getByText("客厅空调")).toBeTruthy();
    expect(within(picker).getByText("离线 · 只读")).toBeTruthy();
    expect(screen.queryByTestId("hotspot-control-modal")).toBeNull();
    expect(
      container.querySelector(
        ".home-cluster-modal__panel.is-climate:not(.home-climate-picker__panel)",
      ),
    ).toBeNull();

    const airConditionerButton = within(picker).getByText("客厅空调").closest("button");
    expect(airConditionerButton).not.toBeNull();
    fireEvent.click(airConditionerButton!);

    await waitFor(() => {
      expect(screen.getByTestId("hotspot-control-modal").textContent).toBe(
        "detail:客厅空调",
      );
    });
  });

  it("shows an empty climate picker when no climate devices exist", async () => {
    mockDeviceDirectory([
      makeDevice({
        device_id: "speaker-1",
        device_type: "media_player",
        display_name: "客厅音箱",
        room_name: "客厅",
      }),
    ]);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <HomeDashboardPage />
      </MemoryRouter>,
    );

    const climateLabel = await screen.findByText("温控");
    const climateButton = climateLabel.closest("button");
    expect(climateButton).not.toBeNull();
    fireEvent.click(climateButton!);

    expect(await screen.findByText("当前没有温控设备")).toBeTruthy();
    expect(screen.queryByTestId("hotspot-control-modal")).toBeNull();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { SessionModel } from "../../api/types";
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
  fetchDevices: vi.fn(async () => ({
    items: [
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
    page: 1,
    page_size: 200,
    total: 1,
  })),
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

beforeEach(() => {
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
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
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { SessionModel } from "../../../api/types";
import { appStore } from "../../../store/useAppStore";
import { ControlTopBar } from "../ControlTopBar";

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
  appStore.setHomeData({
    cache_mode: false,
    sidebar: {
      weather: {
        cache_mode: false,
      },
    },
  });
}

afterEach(() => {
  cleanup();
});

describe("ControlTopBar", () => {
  it("shows only real homepage status actions", () => {
    setReadySession();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <ControlTopBar />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "编辑首页" })).toBeTruthy();
    expect(screen.getByText("HA Connected")).toBeTruthy();
    expect(screen.getByText("PIN")).toBeTruthy();
    expect(screen.getByText("音乐")).toBeTruthy();
    expect(screen.getByText("能耗")).toBeTruthy();
    expect(screen.getByText("天气 实时")).toBeTruthy();
    expect(screen.queryByText("Wi-Fi")).toBeNull();
    expect(screen.queryByText("98%")).toBeNull();
    expect(screen.queryByText("编辑")).toBeNull();
  });
});

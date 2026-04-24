import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as devicesApi from "../../../api/devicesApi";
import * as energyApi from "../../../api/energyApi";
import * as mediaApi from "../../../api/mediaApi";
import * as systemConnectionsApi from "../../../api/systemConnectionsApi";
import type {
  DefaultMediaDto,
  DeviceListItemDto,
  EnergyDto,
  SystemConnectionsEnvelopeDto,
} from "../../../api/types";
import { useSettingsIntegrations } from "../useSettingsIntegrations";

vi.mock("../../../api/devicesApi", () => ({
  fetchDevices: vi.fn(),
}));

vi.mock("../../../api/energyApi", () => ({
  clearEnergyBinding: vi.fn(),
  fetchEnergy: vi.fn(),
  refreshEnergy: vi.fn(),
  saveEnergyBinding: vi.fn(),
}));

vi.mock("../../../api/mediaApi", () => ({
  bindDefaultMedia: vi.fn(),
  fetchDefaultMedia: vi.fn(),
  unbindDefaultMedia: vi.fn(),
}));

vi.mock("../../../api/systemConnectionsApi", () => ({
  fetchSystemConnections: vi.fn(),
  reloadHomeAssistantDevices: vi.fn(),
  saveHomeAssistantConnection: vi.fn(),
  testHomeAssistantConnection: vi.fn(),
}));

const mockedDevicesApi = vi.mocked(devicesApi);
const mockedEnergyApi = vi.mocked(energyApi);
const mockedMediaApi = vi.mocked(mediaApi);
const mockedSystemConnectionsApi = vi.mocked(systemConnectionsApi);

const energyResponse = {
  binding_status: "BOUND",
  entity_map: {
    balance: "sensor.balance",
    monthly_usage: "sensor.monthly",
  },
} as unknown as EnergyDto;

const mediaResponse = {
  binding_status: "BOUND",
  device_id: "media-speaker",
  display_name: "Living speaker",
} as unknown as DefaultMediaDto;

const systemConnectionsResponse = {
  home_assistant: {
    connection_mode: "TOKEN",
    base_url_masked: "https://ha.local",
    connection_status: "CONNECTED",
    auth_configured: true,
    last_test_at: "2026-04-24T10:00:00Z",
    last_test_result: "OK",
    last_sync_at: null,
    last_sync_result: null,
  },
} as unknown as SystemConnectionsEnvelopeDto;

function device(
  overrides: Partial<DeviceListItemDto> & Pick<DeviceListItemDto, "device_id" | "display_name">,
): DeviceListItemDto {
  return {
    device_type: "sensor",
    raw_name: null,
    is_readonly_device: false,
    ...overrides,
  } as DeviceListItemDto;
}

function renderIntegrations(canEdit = true) {
  const onSettingsReload = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() =>
    useSettingsIntegrations({ canEdit, onSettingsReload }),
  );

  return { ...hook, onSettingsReload };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedEnergyApi.fetchEnergy.mockResolvedValue(energyResponse);
  mockedEnergyApi.saveEnergyBinding.mockResolvedValue({
    message: "绑定已保存。",
  } as Awaited<ReturnType<typeof energyApi.saveEnergyBinding>>);
  mockedEnergyApi.clearEnergyBinding.mockResolvedValue({
    message: "绑定已清除。",
  } as Awaited<ReturnType<typeof energyApi.clearEnergyBinding>>);
  mockedEnergyApi.refreshEnergy.mockResolvedValue({
    refresh_status: "SUCCESS",
    refresh_status_detail: "SUCCESS_UPDATED",
  } as Awaited<ReturnType<typeof energyApi.refreshEnergy>>);
  mockedMediaApi.fetchDefaultMedia.mockResolvedValue(mediaResponse);
  mockedMediaApi.bindDefaultMedia.mockResolvedValue({
    display_name: "Living speaker",
  } as Awaited<ReturnType<typeof mediaApi.bindDefaultMedia>>);
  mockedMediaApi.unbindDefaultMedia.mockResolvedValue({
    display_name: null,
  } as Awaited<ReturnType<typeof mediaApi.unbindDefaultMedia>>);
  mockedDevicesApi.fetchDevices.mockResolvedValue({
    items: [],
    page_info: {
      page: 1,
      page_size: 200,
      total: 0,
      total_pages: 0,
    },
  } as unknown as Awaited<ReturnType<typeof devicesApi.fetchDevices>>);
  mockedSystemConnectionsApi.fetchSystemConnections.mockResolvedValue(
    systemConnectionsResponse,
  );
});

afterEach(() => {
  cleanup();
});

describe("useSettingsIntegrations", () => {
  it("loads integration state into panel drafts", async () => {
    const { result } = renderIntegrations();

    await act(async () => {
      await result.current.loadEnergyState();
      await result.current.loadMediaState();
      await result.current.loadSystemConnection();
    });

    expect(result.current.energyState).toBe(energyResponse);
    expect(result.current.energyDraft).toMatchObject({
      accountId: "8170",
      entityMap: {
        balance: "sensor.balance",
        monthly_usage: "sensor.monthly",
        yesterday_usage: "sensor.last_electricity_usage_8170",
        yearly_usage: "sensor.yearly_electricity_usage_8170",
      },
    });
    expect(result.current.mediaState).toBe(mediaResponse);
    expect(result.current.selectedMediaDeviceId).toBe("media-speaker");
    expect(result.current.systemDraft).toMatchObject({
      authConfigured: true,
      baseUrlMasked: "https://ha.local",
      connectionStatus: "CONNECTED",
    });
  });

  it("saves a trimmed energy binding payload and refreshes settings", async () => {
    const { result, onSettingsReload } = renderIntegrations();

    act(() => {
      result.current.updateEnergyAccountId("  acct-1  ");
      result.current.updateEnergyEntity("balance", " sensor.balance.next ");
      result.current.updateEnergyEntity("monthly_usage", " ");
    });

    await act(async () => {
      await result.current.handleSaveEnergyBinding();
    });

    expect(mockedEnergyApi.saveEnergyBinding).toHaveBeenCalledWith({
      payload: {
        provider: "SGCC_SIDECAR",
        account_id: "acct-1",
        entity_map: {
          balance: "sensor.balance.next",
          yesterday_usage: "sensor.last_electricity_usage_8170",
          yearly_usage: "sensor.yearly_electricity_usage_8170",
        },
      },
    });
    expect(onSettingsReload).toHaveBeenCalledTimes(1);
    expect(result.current.energyMessage).toBe("绑定已保存。");
  });

  it("blocks protected actions when management PIN is inactive", async () => {
    const { result } = renderIntegrations(false);

    await act(async () => {
      await result.current.handleSaveEnergyBinding();
      await result.current.handleSaveSystemConnection();
    });

    expect(mockedEnergyApi.saveEnergyBinding).not.toHaveBeenCalled();
    expect(mockedSystemConnectionsApi.saveHomeAssistantConnection).not.toHaveBeenCalled();
    expect(result.current.energyMessage).toBe("保存能耗绑定前，请先验证管理 PIN。");
    expect(result.current.systemMessage).toBe(
      "保存 Home Assistant 连接前，请先验证管理 PIN。",
    );
  });

  it("prefers writable media candidates and sorts them for the default media selector", async () => {
    mockedDevicesApi.fetchDevices.mockResolvedValue({
      items: [
        device({
          device_id: "readonly-tv",
          display_name: "Readonly TV",
          device_type: "media_player",
          is_readonly_device: true,
        }),
        device({
          device_id: "sensor-1",
          display_name: "Other sensor",
          device_type: "sensor",
        }),
        device({
          device_id: "speaker-b",
          display_name: "Bedroom speaker",
          device_type: "speaker",
        }),
        device({
          device_id: "speaker-a",
          display_name: "Atrium speaker",
          device_type: "media_player",
        }),
      ],
      page_info: {
        page: 1,
        page_size: 200,
        total: 4,
        total_pages: 1,
      },
    } as unknown as Awaited<ReturnType<typeof devicesApi.fetchDevices>>);
    const { result } = renderIntegrations();

    await act(async () => {
      await result.current.loadMediaCandidates();
    });

    expect(result.current.mediaCandidates.map((item) => item.device_id)).toEqual([
      "speaker-a",
      "speaker-b",
    ]);
  });

  it("binds the selected default media device and reloads dependent settings", async () => {
    const { result, onSettingsReload } = renderIntegrations();

    act(() => {
      result.current.setSelectedMediaDeviceId("media-speaker");
    });

    await act(async () => {
      await result.current.handleBindDefaultMedia();
    });

    expect(mockedMediaApi.bindDefaultMedia).toHaveBeenCalledWith({
      device_id: "media-speaker",
    });
    expect(mockedMediaApi.fetchDefaultMedia).toHaveBeenCalledTimes(1);
    expect(onSettingsReload).toHaveBeenCalledTimes(1);
    expect(result.current.mediaMessage).toBe("默认媒体已切换为 Living speaker。");
  });
});

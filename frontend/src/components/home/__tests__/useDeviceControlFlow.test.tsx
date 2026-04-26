import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as deviceControlsApi from "../../../api/deviceControlsApi";
import * as devicesApi from "../../../api/devicesApi";
import type {
  DeviceControlAcceptedDto,
  DeviceControlResultDto,
  DeviceDetailDto,
} from "../../../api/types";
import { useDeviceControlFlow } from "../useDeviceControlFlow";

vi.mock("../../../api/devicesApi", () => ({
  fetchDeviceDetail: vi.fn(),
}));

vi.mock("../../../api/deviceControlsApi", () => ({
  acceptDeviceControl: vi.fn(),
  fetchDeviceControlResult: vi.fn(),
}));

const mockedDevicesApi = vi.mocked(devicesApi);
const mockedDeviceControlsApi = vi.mocked(deviceControlsApi);

function detail(deviceId: string): DeviceDetailDto {
  return {
    control_schema: [
      {
        action_type: "SET_POWER_STATE",
        target_key: `switch.${deviceId}`,
        target_scope: "ENTITY",
        unit: null,
        value_type: "BOOLEAN",
      },
    ],
    device_id: deviceId,
    display_name: deviceId,
    is_complex_device: false,
    is_offline: false,
    is_readonly_device: false,
    room_name: "客厅",
    status: "off",
  } as unknown as DeviceDetailDto;
}

function accepted(requestId = "request-1"): DeviceControlAcceptedDto {
  return {
    request_id: requestId,
  } as unknown as DeviceControlAcceptedDto;
}

function result(status: DeviceControlResultDto["execution_status"]): DeviceControlResultDto {
  return {
    execution_status: status,
  } as unknown as DeviceControlResultDto;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedDevicesApi.fetchDeviceDetail.mockImplementation((deviceId) =>
    Promise.resolve(detail(String(deviceId))),
  );
  mockedDeviceControlsApi.acceptDeviceControl.mockResolvedValue(accepted());
  mockedDeviceControlsApi.fetchDeviceControlResult.mockResolvedValue(result("SUCCESS"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDeviceControlFlow", () => {
  it("loads device details and initializes schema values", async () => {
    const { result: hook } = renderHook(() =>
      useDeviceControlFlow({
        deviceIds: ["light-1"],
        enabled: true,
        requestPrefix: "test",
      }),
    );

    await waitFor(() => {
      expect(hook.current.details).toHaveLength(1);
    });

    const schema = hook.current.details[0].control_schema[0];
    const key = hook.current.controlKey("light-1", schema, 0);
    expect(hook.current.values[key]).toBe(true);
  });

  it("submits a control request and records the completed result", async () => {
    const { result: hook } = renderHook(() =>
      useDeviceControlFlow({
        deviceIds: ["light-1"],
        enabled: true,
        requestPrefix: "test",
      }),
    );
    await waitFor(() => {
      expect(hook.current.details).toHaveLength(1);
    });

    const detailValue = hook.current.details[0];
    const schema = detailValue.control_schema[0];
    let submitPromise!: Promise<DeviceControlResultDto | null>;
    vi.useFakeTimers();
    act(() => {
      submitPromise = hook.current.submitControl({
        detail: detailValue,
        schema,
        schemaIndex: 0,
        overrideValue: false,
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
      await submitPromise;
    });

    expect(mockedDeviceControlsApi.acceptDeviceControl).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: "SET_POWER_STATE",
        device_id: "light-1",
      }),
    );
    expect(hook.current.resultByDeviceId["light-1"]?.execution_status).toBe("SUCCESS");
    expect(hook.current.messageByDeviceId["light-1"]).toBe("设备已完成控制");
  });

  it("keeps pending state isolated per device", async () => {
    mockedDeviceControlsApi.fetchDeviceControlResult.mockResolvedValue(result("PENDING"));
    const { result: hook } = renderHook(() =>
      useDeviceControlFlow({
        deviceIds: ["light-1", "light-2"],
        enabled: true,
        pollAttempts: 1,
        requestPrefix: "test",
      }),
    );
    await waitFor(() => {
      expect(hook.current.details).toHaveLength(2);
    });

    const firstDetail = hook.current.details[0];
    const secondDetail = hook.current.details[1];
    const firstSchema = firstDetail.control_schema[0];
    const secondSchema = secondDetail.control_schema[0];
    const firstKey = hook.current.controlKey(firstDetail.device_id, firstSchema, 0);
    const secondKey = hook.current.controlKey(secondDetail.device_id, secondSchema, 0);

    vi.useFakeTimers();
    let submitPromise!: Promise<DeviceControlResultDto | null>;
    act(() => {
      submitPromise = hook.current.submitControl({
        detail: firstDetail,
        schema: firstSchema,
        schemaIndex: 0,
      });
    });

    expect(hook.current.pendingByKey[firstKey]).toBe(true);
    expect(hook.current.pendingByKey[secondKey]).not.toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
      await submitPromise;
    });
    expect(hook.current.messageByDeviceId[firstDetail.device_id]).toBe("设备尚未返回成功确认");
  });
});

import { describe, expect, it } from "vitest";
import type { DeviceListItemDto, EnergyDto, EnergyRefreshDto } from "../../api/types";
import {
  buildEnergyBindingPayload,
  createEnergyBindingDraft,
  formatEnergyRefreshMessage,
  inferEnergyAccountIdFromEntities,
  isMediaCandidateDevice,
} from "../hooks/settingsIntegrationModels";

function device(input: Partial<DeviceListItemDto>): DeviceListItemDto {
  return {
    device_id: "device-1",
    display_name: "Device",
    device_type: "sensor",
    raw_name: null,
    is_readonly_device: false,
    ...input,
  } as DeviceListItemDto;
}

describe("settingsIntegrationModels", () => {
  it("infers energy account and builds a trimmed binding payload", () => {
    const energy = {
      entity_map: {
        balance: "sensor.electricity_charge_balance_8170",
      },
    } as unknown as EnergyDto;
    const draft = createEnergyBindingDraft(energy);

    expect(inferEnergyAccountIdFromEntities(energy.entity_map ?? {})).toBe("8170");
    expect(draft.accountId).toBe("8170");
    expect(buildEnergyBindingPayload({
      accountId: " acct-1 ",
      entityMap: {
        ...draft.entityMap,
        balance: " sensor.balance ",
        monthly_usage: " ",
      },
    })).toEqual({
      provider: "SGCC_SIDECAR",
      account_id: "acct-1",
      entity_map: {
        balance: "sensor.balance",
        yesterday_usage: "sensor.last_electricity_usage_8170",
        yearly_usage: "sensor.yearly_electricity_usage_8170",
      },
    });
  });

  it("formats refresh detail and detects media candidates", () => {
    expect(formatEnergyRefreshMessage({
      refresh_status: "FAILED",
      refresh_status_detail: "FAILED_SOURCE_TIMEOUT",
    } as EnergyRefreshDto)).toBe("已触发上游同步，但等待 HA 更新超时。");
    expect(isMediaCandidateDevice(device({ device_type: "media_player" }))).toBe(true);
    expect(isMediaCandidateDevice(device({ display_name: "Kitchen speaker" }))).toBe(true);
    expect(isMediaCandidateDevice(device({ device_type: "sensor" }))).toBe(false);
  });
});

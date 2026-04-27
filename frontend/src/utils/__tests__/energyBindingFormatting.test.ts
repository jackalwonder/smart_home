import { describe, expect, it } from "vitest";
import { EnergyDto } from "../../api/types";
import type { EnergyBindingDraft } from "../../components/settings/EnergyBindingPanel";
import {
  extractEntitySuffix,
  formatEnergyValue,
  formatSgccRuntimeStatus,
  formatStatus,
  formatTimestamp,
  formatTaskTimestamp,
  formatValue,
  resolveEntitySuffix,
  resolveEnergyTaskSteps,
} from "../energyBindingFormatting";

const energyFixture = {
  binding_status: "BOUND",
  refresh_status: "SUCCESS",
  refresh_status_detail: "SUCCESS_UPDATED",
  entity_map: { balance: "sensor.charge_abc123" },
  cache_mode: null,
  last_error_code: null,
  account_id_masked: "国网***001",
  yesterday_usage: 12.5,
  monthly_usage: 180.3,
  balance: 520,
  yearly_usage: 2100,
  updated_at: "2025-06-15T10:00:00Z",
  system_updated_at: "2025-06-15T09:55:00Z",
  source_updated_at: "2025-06-15T09:45:00Z",
} as unknown as EnergyDto;

const draftFixture: EnergyBindingDraft = {
  accountId: "entity-123",
  entityMap: {
    balance: "",
    monthly_usage: "",
    yearly_usage: "",
    yesterday_usage: "",
  },
};

describe("energyBindingFormatting", () => {
  describe("formatValue", () => {
    it("returns '-' for null, undefined, or empty", () => {
      expect(formatValue(null)).toBe("-");
      expect(formatValue(undefined)).toBe("-");
      expect(formatValue("")).toBe("-");
    });

    it("converts to string for non-empty values", () => {
      expect(formatValue("active")).toBe("active");
      expect(formatValue(42)).toBe("42");
      expect(formatValue(false)).toBe("false");
    });
  });

  describe("formatEnergyValue", () => {
    it("returns '-' for non-finite numbers", () => {
      expect(formatEnergyValue(null, "kWh")).toBe("-");
      expect(formatEnergyValue(undefined, "kWh")).toBe("-");
      expect(formatEnergyValue(NaN, "kWh")).toBe("-");
    });

    it("formats with unit", () => {
      expect(formatEnergyValue(15.3, "kWh")).toBe("15.3 kWh");
      expect(formatEnergyValue(520, "元")).toBe("520 元");
    });
  });

  describe("formatTimestamp", () => {
    it("returns '-' for null or undefined", () => {
      expect(formatTimestamp(null)).toBe("-");
      expect(formatTimestamp(undefined)).toBe("-");
    });

    it("returns raw value for invalid date", () => {
      expect(formatTimestamp("bad-date")).toBe("bad-date");
    });

    it("formats valid timestamp in Chinese style", () => {
      const result = formatTimestamp("2025-03-15T08:30:00Z");
      expect(result).toContain("月");
      expect(result).toContain("日");
    });
  });

  describe("formatTaskTimestamp", () => {
    it("returns 暂无记录 when underlying formatTimestamp returns '-'", () => {
      expect(formatTaskTimestamp(null)).toBe("暂无记录");
    });

    it("returns formatted timestamp for valid dates", () => {
      const result = formatTaskTimestamp("2025-06-15T12:00:00Z");
      expect(result).toContain("月");
    });
  });

  describe("formatStatus", () => {
    it("describes SUCCESS_UPDATED detail", () => {
      expect(
        formatStatus({
          refresh_status_detail: "SUCCESS_UPDATED",
        } as unknown as EnergyDto),
      ).toBe("已刷新，HA 源已更新");
    });

    it("describes FAILED_UPSTREAM_TRIGGER detail", () => {
      expect(
        formatStatus({
          refresh_status_detail: "FAILED_UPSTREAM_TRIGGER",
        } as unknown as EnergyDto),
      ).toBe("触发上游同步失败");
    });

    it("appends last_error_code when present", () => {
      const energy = {
        refresh_status: "FAILED",
        refresh_status_detail: "FAILED",
        last_error_code: "TIMEOUT",
      } as unknown as EnergyDto;
      expect(formatStatus(energy)).toContain("TIMEOUT");
    });
  });

  describe("extractEntitySuffix", () => {
    it("extracts suffix from entity id", () => {
      expect(extractEntitySuffix("sensor.charge_abc123")).toBe("abc123");
    });

    it("returns null for null", () => {
      expect(extractEntitySuffix(null)).toBeNull();
    });

    it("returns null when no suffix match", () => {
      expect(extractEntitySuffix("sensor.charge")).toBeNull();
    });
  });

  describe("resolveEntitySuffix", () => {
    it("resolves from energy entity_map balance first", () => {
      expect(resolveEntitySuffix(energyFixture, draftFixture)).toBe("_abc123");
    });

    it("falls back to monthly_usage in entity_map", () => {
      const energy = {
        entity_map: { monthly_usage: "sensor.monthly_xyz789" },
      } as unknown as EnergyDto;
      expect(resolveEntitySuffix(energy, draftFixture)).toBe("_xyz789");
    });

    it("returns '-' when nothing is bound", () => {
      const energy = { entity_map: null } as unknown as EnergyDto;
      const draft = { ...draftFixture, entityMap: {} } as any;
      expect(resolveEntitySuffix(energy, draft)).toBe("-");
    });
  });

  describe("formatSgccRuntimeStatus", () => {
    it("returns 待绑定 when unbound", () => {
      const unbound = { binding_status: "UNBOUND" } as unknown as EnergyDto;
      expect(formatSgccRuntimeStatus(unbound)).toBe("待绑定");
    });

    it("returns 同步正常 on success", () => {
      expect(formatSgccRuntimeStatus(energyFixture)).toBe("同步正常");
    });

    it("returns 同步失败 on failed status", () => {
      const failed = {
        binding_status: "BOUND",
        refresh_status: "FAILED",
      } as unknown as EnergyDto;
      expect(formatSgccRuntimeStatus(failed)).toBe("同步失败");
    });

    it("describes cache mode with stale source", () => {
      const cached = {
        binding_status: "BOUND",
        refresh_status: "SUCCESS",
        refresh_status_detail: "SUCCESS_STALE_SOURCE",
        cache_mode: "file",
      } as unknown as EnergyDto;
      expect(formatSgccRuntimeStatus(cached)).toBe("已读取缓存，源数据暂未更新");
    });
  });

  describe("resolveEnergyTaskSteps", () => {
    it("returns 4 task steps with correct tones for bound energy", () => {
      const steps = resolveEnergyTaskSteps(
        energyFixture,
        draftFixture,
        "DATA_READY",
        1,
        "2025-06-15T09:00:00Z",
      );
      expect(steps).toHaveLength(4);
      expect(steps[0].label).toBe("国网数据");
      expect(steps[0].tone).toBe("success");
      expect(steps[1].label).toBe("账号缓存");
      expect(steps[2].label).toBe("能耗绑定");
      expect(steps[2].tone).toBe("success");
      expect(steps[3].label).toBe("最近刷新");
    });

    it("shows warning tone for unbound energy", () => {
      const unbound = {
        ...energyFixture,
        binding_status: "UNBOUND",
      } as unknown as EnergyDto;
      const steps = resolveEnergyTaskSteps(unbound, draftFixture, "LOGIN_RUNNING", 0, null);
      expect(steps[0].tone).toBe("warning");
      expect(steps[1].tone).toBe("warning");
      expect(steps[2].tone).not.toBe("success");
    });
  });
});

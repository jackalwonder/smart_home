import { describe, expect, it } from "vitest";
import {
  describeControlSchema,
  formatControlAction,
  formatControlOption,
  formatControlRange,
  formatControlTarget,
  formatControlValueType,
} from "../controlSchemaFormatting";

describe("controlSchemaFormatting", () => {
  describe("describeControlSchema", () => {
    it("describes schema with allowed values", () => {
      expect(
        describeControlSchema({
          action_type: "SET_MODE",
          allowed_values: ["auto", "smart"],
          is_quick_action: false,
          requires_detail_entry: false,
          target_key: "mode",
          target_scope: null,
          unit: null,
          value_range: null,
          value_type: "STRING",
        }),
      ).toEqual({ target: "模式", value: "自动、智能" });
    });

    it("describes schema with value range and unit", () => {
      expect(
        describeControlSchema({
          action_type: "SET_TEMPERATURE",
          allowed_values: [],
          is_quick_action: false,
          requires_detail_entry: false,
          target_key: "temperature",
          target_scope: null,
          unit: "°C",
          value_range: { min: 16, max: 30, step: 1 },
          value_type: "INTEGER",
        }),
      ).toEqual({ target: "温度", value: "16 到 30 °C，步进 1" });
    });

    it("describes schema with value type fallback", () => {
      expect(
        describeControlSchema({
          action_type: "TURN_ON",
          allowed_values: [],
          is_quick_action: true,
          requires_detail_entry: false,
          target_key: null,
          target_scope: "PRIMARY",
          unit: null,
          value_range: null,
          value_type: "NONE",
        }),
      ).toEqual({ target: "主操作", value: "无需输入" });
    });
  });

  describe("formatControlAction", () => {
    it("returns chinese label for known actions", () => {
      expect(formatControlAction("TOGGLE")).toBe("开关切换");
      expect(formatControlAction("TURN_ON")).toBe("开启");
      expect(formatControlAction("TURN_OFF")).toBe("关闭");
      expect(formatControlAction("SET_BRIGHTNESS")).toBe("调节亮度");
    });

    it("falls back to humanized value for unknown actions", () => {
      expect(formatControlAction("CUSTOM_ACTION")).toBe("CUSTOM ACTION");
    });

    it("returns fallback for null", () => {
      expect(formatControlAction(null)).toBe("控制项");
    });
  });

  describe("formatControlTarget", () => {
    it("detects fridge and freezer target keys", () => {
      expect(
        formatControlTarget({ target_key: "fridge_temp", target_scope: null } as any),
      ).toBe("冷藏室温度");
      expect(
        formatControlTarget({ target_key: "freeze.temp", target_scope: null } as any),
      ).toBe("冷冻室温度");
    });

    it("detects temperature, brightness, mode, and power targets", () => {
      expect(
        formatControlTarget({ target_key: "temperature", target_scope: null } as any),
      ).toBe("温度");
      expect(
        formatControlTarget({ target_key: "brightness", target_scope: null } as any),
      ).toBe("亮度");
      expect(formatControlTarget({ target_key: "mode", target_scope: null } as any)).toBe(
        "模式",
      );
      expect(
        formatControlTarget({ target_key: "power_switch", target_scope: null } as any),
      ).toBe("开关");
    });

    it("returns 主操作 for PRIMARY scope", () => {
      expect(formatControlTarget({ target_key: null, target_scope: "PRIMARY" } as any)).toBe(
        "主操作",
      );
    });

    it("returns 设备动作 for button targets", () => {
      expect(
        formatControlTarget({ target_key: "button.wakeup", target_scope: "OTHER" } as any),
      ).toBe("设备动作");
    });

    it("handles empty schema as 设备控制", () => {
      expect(formatControlTarget({ target_key: null, target_scope: null } as any)).toBe(
        "设备控制",
      );
    });
  });

  describe("formatControlOption", () => {
    it("maps known option values to chinese", () => {
      expect(formatControlOption("auto")).toBe("自动");
      expect(formatControlOption("off")).toBe("关闭");
      expect(formatControlOption("smart")).toBe("智能");
    });

    it("returns raw value for unknown options", () => {
      expect(formatControlOption("custom")).toBe("custom");
    });
  });

  describe("formatControlValueType", () => {
    it("maps known types to chinese", () => {
      expect(formatControlValueType("BOOLEAN")).toBe("开关值");
      expect(formatControlValueType("INTEGER")).toBe("整数");
      expect(formatControlValueType("NONE")).toBe("无需输入");
    });

    it("returns 无需输入 for null", () => {
      expect(formatControlValueType(null)).toBe("无需输入");
    });
  });

  describe("formatControlRange", () => {
    it("formats a valid range object", () => {
      expect(formatControlRange({ min: 0, max: 100, step: 5 }, "%")).toBe(
        "0 到 100 %，步进 5",
      );
    });

    it("returns formatted json for non-object values", () => {
      expect(formatControlRange(null)).toBe("-");
      expect(formatControlRange("")).toBe("");
    });

    it("handles missing min/max gracefully", () => {
      expect(formatControlRange({}, "kWh")).toBe("- 到 - kWh");
    });
  });
});

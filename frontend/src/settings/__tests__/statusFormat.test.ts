import { describe, expect, it } from "vitest";
import {
  formatSettingsStatus,
  getSettingsStatusTone,
} from "../statusFormat";

describe("settings status formatting", () => {
  it("localizes connection and binding statuses", () => {
    expect(formatSettingsStatus("CONNECTED", "connection")).toBe("已连接");
    expect(getSettingsStatusTone("CONNECTED", "connection")).toBe("success");
    expect(formatSettingsStatus("BOUND", "connection")).toBe("已绑定");
    expect(getSettingsStatusTone("BOUND", "connection")).toBe("success");
  });

  it("localizes media and SGCC warning states", () => {
    expect(formatSettingsStatus("MEDIA_UNSET", "media")).toBe("未配置媒体");
    expect(getSettingsStatusTone("MEDIA_UNSET", "media")).toBe("warning");
    expect(formatSettingsStatus("EXPIRED", "sgcc")).toBe("二维码已过期");
    expect(getSettingsStatusTone("EXPIRED", "sgcc")).toBe("warning");
  });

  it("localizes SGCC login phases separately from QR code expiry", () => {
    expect(formatSettingsStatus("LOGIN_RUNNING", "sgcc")).toBe("正在登录国网");
    expect(formatSettingsStatus("FETCHING_DATA", "sgcc")).toBe("正在拉取国网数据");
    expect(formatSettingsStatus("DATA_READY", "sgcc")).toBe("国网数据已就绪");
    expect(formatSettingsStatus("QR_EXPIRED", "sgcc")).toBe("二维码已过期");
    expect(getSettingsStatusTone("DATA_READY", "sgcc")).toBe("success");
    expect(getSettingsStatusTone("FETCHING_DATA", "sgcc")).toBe("warning");
  });

  it("handles backup and unknown states", () => {
    expect(formatSettingsStatus("READY", "backup")).toBe("可用");
    expect(getSettingsStatusTone("READY", "backup")).toBe("success");
    expect(formatSettingsStatus("UNKNOWN", "sgcc")).toBe("状态未知");
    expect(getSettingsStatusTone("UNKNOWN", "sgcc")).toBe("neutral");
    expect(formatSettingsStatus(null, "generic")).toBe("未获取");
  });
});

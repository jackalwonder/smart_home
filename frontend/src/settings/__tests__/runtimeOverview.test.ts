import { describe, expect, it } from "vitest";
import type {
  BackupListItemDto,
  DefaultMediaDto,
  EnergyDto,
  SgccLoginQrCodeStatusDto,
} from "../../api/types";
import {
  buildSettingsRuntimeCards,
  formatShortTimestamp,
  getEnergyOverviewCopy,
  getSgccOverviewCopy,
} from "../runtimeOverview";

describe("runtimeOverview", () => {
  it("formats invalid and valid short timestamps", () => {
    expect(formatShortTimestamp(null)).toBeNull();
    expect(formatShortTimestamp("not-a-date")).toBe("not-a-date");
    expect(formatShortTimestamp("2026-04-24T09:05:00+08:00")).toBe("4月24日 09:05");
  });

  it("describes SGCC data-ready and QR-ready states", () => {
    expect(
      getSgccOverviewCopy({
        phase: "DATA_READY",
        account_count: 2,
        latest_account_timestamp: "2026-04-24T09:05:00+08:00",
      } as SgccLoginQrCodeStatusDto),
    ).toEqual({
      actionLabel: "查看国网账号",
      description: "已发现 2 个账号，最新数据 4月24日 09:05。二维码状态只作为扫码文件明细。",
    });

    expect(
      getSgccOverviewCopy({ phase: "QR_READY" } as SgccLoginQrCodeStatusDto),
    ).toEqual({
      actionLabel: "去扫码",
      description: "二维码可扫码，请用国家电网 App 完成登录确认。",
    });
  });

  it("guides energy binding from SGCC data and reports refresh failures", () => {
    expect(
      getEnergyOverviewCopy(
        { binding_status: "UNBOUND" } as EnergyDto,
        { phase: "DATA_READY" } as SgccLoginQrCodeStatusDto,
      ),
    ).toMatchObject({
      actionLabel: "绑定能耗账号",
      description: "国网数据已就绪，下一步是把账号缓存绑定到首页能耗卡。",
    });

    expect(
      getEnergyOverviewCopy(
        {
          binding_status: "BOUND",
          refresh_status: "FAILED",
          last_error_code: "UPSTREAM_TIMEOUT",
        } as EnergyDto,
        null,
      ),
    ).toEqual({
      actionLabel: "查看刷新错误",
      description: "能耗已绑定，但最近刷新失败：UPSTREAM_TIMEOUT。",
      status: "刷新失败",
      tone: "danger",
    });
  });

  it("builds runtime cards from integration, backup, and terminal state", () => {
    const cards = buildSettingsRuntimeCards({
      backupItems: [
        { status: "READY" },
        { status: "FAILED" },
      ] as BackupListItemDto[],
      energyState: {
        binding_status: "BOUND",
        refresh_status: "SUCCESS",
        updated_at: "2026-04-24T09:05:00+08:00",
      } as EnergyDto,
      mediaState: {
        binding_status: "MEDIA_SET",
        display_name: "Living speaker",
      } as DefaultMediaDto,
      sgccLoginQrCode: { phase: "DATA_READY", account_count: 1 } as SgccLoginQrCodeStatusDto,
      systemConnectionStatus: "CONNECTED",
      terminalTokenConfigured: true,
    });

    expect(cards.map((card) => card.key)).toEqual([
      "ha",
      "energy",
      "media",
      "sgcc",
      "terminal",
      "backup",
    ]);
    expect(cards.find((card) => card.key === "media")).toMatchObject({
      status: "Living speaker",
      tone: "neutral",
    });
    expect(cards.find((card) => card.key === "terminal")).toMatchObject({
      status: "已准备",
      tone: "success",
    });
    expect(cards.find((card) => card.key === "backup")).toMatchObject({
      status: "1/2 可用",
      tone: "success",
    });
  });
});

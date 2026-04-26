import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  BackupListItemDto,
  DefaultMediaDto,
  EnergyDto,
  SgccLoginQrCodeStatusDto,
} from "../../../api/types";
import { useSettingsOverviewProps } from "../useSettingsOverviewProps";

describe("useSettingsOverviewProps", () => {
  it("builds overview props and derived integration status labels", () => {
    const onSelectSection = vi.fn();
    const backupItems = [
      { status: "READY" },
      { status: "FAILED" },
    ] as unknown as BackupListItemDto[];
    const { result } = renderHook(() =>
      useSettingsOverviewProps({
        backupItems,
        energyState: { binding_status: "BOUND" } as unknown as EnergyDto,
        mediaState: {
          binding_status: "BOUND",
          display_name: "Living speaker",
        } as unknown as DefaultMediaDto,
        onSelectSection,
        pinActive: true,
        selectedFavoriteCount: 3,
        sgccLoginQrCode: {
          phase: "DATA_READY",
          status: "DATA_READY",
        } as unknown as SgccLoginQrCodeStatusDto,
        systemConnectionStatus: "CONNECTED",
        terminalTokenConfigured: false,
      }),
    );

    expect(result.current.mediaStatus).toBe("Living speaker");
    expect(result.current.sgccStatus).toBe("DATA_READY");
    expect(result.current.overviewProps).toEqual(
      expect.objectContaining({
        backupCount: 2,
        onSelectSection,
        pinActive: true,
        selectedFavoriteCount: 3,
      }),
    );
    expect(
      result.current.overviewProps.runtimeCards.find((card) => card.key === "backup"),
    ).toEqual(expect.objectContaining({ status: "1/2 可用" }));
  });
});

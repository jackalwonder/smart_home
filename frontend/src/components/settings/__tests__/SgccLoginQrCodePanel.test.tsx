import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SgccLoginQrCodeStatusDto } from "../../../api/types";
import { SgccLoginQrCodePanel } from "../SgccLoginQrCodePanel";

afterEach(() => {
  cleanup();
});

function renderPanel(status: SgccLoginQrCodeStatusDto) {
  render(
    <SgccLoginQrCodePanel
      bindBusy={false}
      canBind
      canRegenerate
      imageUrl={null}
      loading={false}
      message={null}
      onBindEnergyAccount={vi.fn()}
      onRefreshStatus={vi.fn()}
      onRegenerate={vi.fn()}
      regenerateBusy={false}
      status={status}
    />,
  );
}

describe("SgccLoginQrCodePanel", () => {
  it("prioritizes data-ready phase over expired QR file state", () => {
    renderPanel({
      account_count: 1,
      age_seconds: 120,
      available: false,
      expires_at: "2026-04-24T15:44:44Z",
      file_size_bytes: 9190,
      image_url: null,
      job_kind: null,
      job_phase: null,
      job_state: null,
      last_error: null,
      latest_account_timestamp: "2026-04-24T15:40:00Z",
      message: "SGCC data is ready for 1 account(s).",
      mime_type: "image/png",
      phase: "DATA_READY",
      qr_code_status: "EXPIRED",
      status: "DATA_READY",
      updated_at: "2026-04-24T15:43:44Z",
    });

    expect(screen.getByText("国网数据已就绪")).toBeTruthy();
    expect(screen.getByText("二维码与任务详情")).toBeTruthy();
    expect(screen.queryByText("登录已过期")).toBeNull();
  });
});

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as terminalBootstrapTokensApi from "../../../api/terminalBootstrapTokensApi";
import type {
  TerminalBootstrapTokenAuditItemDto,
  TerminalBootstrapTokenDirectoryItemDto,
} from "../../../api/types";
import { useSettingsTerminalDeliverySection } from "../useSettingsTerminalDeliverySection";

vi.mock("../../../api/terminalBootstrapTokensApi", () => ({
  createOrResetTerminalBootstrapToken: vi.fn(),
  fetchTerminalBootstrapTokenAudits: vi.fn(),
  fetchTerminalBootstrapTokenDirectory: vi.fn(),
  fetchTerminalBootstrapTokenStatus: vi.fn(),
}));

vi.mock("../../../api/terminalPairingCodesApi", () => ({
  claimTerminalPairingCode: vi.fn(),
}));

const mockedTerminalBootstrapTokensApi = vi.mocked(terminalBootstrapTokensApi);

const terminalA: TerminalBootstrapTokenDirectoryItemDto = {
  terminal_id: "terminal-a",
  terminal_code: "A001",
  terminal_name: "Kitchen panel",
  terminal_mode: "WALL_PANEL",
  token_configured: true,
  issued_at: "2026-04-24T09:00:00Z",
  expires_at: "2026-04-25T09:00:00Z",
  last_used_at: null,
};

const terminalB: TerminalBootstrapTokenDirectoryItemDto = {
  terminal_id: "terminal-b",
  terminal_code: "B001",
  terminal_name: "Bedroom panel",
  terminal_mode: "WALL_PANEL",
  token_configured: false,
  issued_at: null,
  expires_at: null,
  last_used_at: null,
};

const audit: TerminalBootstrapTokenAuditItemDto = {
  audit_id: "audit-1",
  terminal_id: "terminal-a",
  terminal_code: "A001",
  terminal_name: "Kitchen panel",
  action_type: "CREATE",
  operator_id: "operator-1",
  operator_name: "Admin",
  acting_terminal_id: "terminal-admin",
  acting_terminal_name: "Admin terminal",
  before_version: null,
  after_version: "v1",
  result_status: "SUCCESS",
  expires_at: "2026-04-25T09:00:00Z",
  rotated: false,
  created_at: "2026-04-24T09:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedTerminalBootstrapTokensApi.fetchTerminalBootstrapTokenDirectory.mockResolvedValue({
    items: [terminalA, terminalB],
  });
  mockedTerminalBootstrapTokensApi.fetchTerminalBootstrapTokenAudits.mockResolvedValue({
    items: [audit],
  });
});

afterEach(() => {
  cleanup();
});

describe("useSettingsTerminalDeliverySection", () => {
  it("loads delivery details and derives selected terminal summary rows", async () => {
    const { result } = renderHook(() =>
      useSettingsTerminalDeliverySection({
        canEdit: true,
        currentTerminalId: "terminal-b",
        operationsGuideOpen: false,
      }),
    );

    await act(async () => {
      await result.current.loadDetails();
    });

    expect(result.current.directory).toEqual([terminalA, terminalB]);
    expect(result.current.audits).toEqual([audit]);
    expect(result.current.selectedTerminal).toBe(terminalB);
    expect(result.current.tokenState).toBe(terminalB);
    expect(result.current.summaryRows).toEqual([
      { label: "终端目录", value: "2 台" },
      { label: "目标终端", value: "Bedroom panel" },
      { label: "详情面板", value: "已收起" },
    ]);
    expect(result.current.compactOverviewRows).toEqual([
      { label: "终端目录", value: "2 台" },
      { label: "目标终端", value: "Bedroom panel" },
      { label: "激活凭据", value: "待生成" },
      { label: "流程说明", value: "已收起" },
    ]);
  });

  it("toggles detail visibility and follows operations guide state", async () => {
    const { result, rerender } = renderHook(
      ({ operationsGuideOpen }) =>
        useSettingsTerminalDeliverySection({
          canEdit: true,
          currentTerminalId: "terminal-a",
          operationsGuideOpen,
        }),
      { initialProps: { operationsGuideOpen: false } },
    );

    await act(async () => {
      await result.current.loadDetails();
      result.current.toggleDetails();
    });

    expect(result.current.showDetails).toBe(true);
    expect(result.current.summaryRows.at(2)).toEqual({
      label: "详情面板",
      value: "已展开",
    });

    rerender({ operationsGuideOpen: true });

    expect(result.current.compactOverviewRows.at(2)).toEqual({
      label: "激活凭据",
      value: "已就绪",
    });
    expect(result.current.compactOverviewRows.at(3)).toEqual({
      label: "流程说明",
      value: "已展开",
    });

    act(() => {
      result.current.resetDetails();
    });

    expect(result.current.showDetails).toBe(false);
  });

  it("clears delivery state when management PIN is inactive", async () => {
    const { result } = renderHook(() =>
      useSettingsTerminalDeliverySection({
        canEdit: false,
        currentTerminalId: "terminal-a",
        operationsGuideOpen: false,
      }),
    );

    await act(async () => {
      await result.current.loadDetails();
    });

    expect(
      mockedTerminalBootstrapTokensApi.fetchTerminalBootstrapTokenDirectory,
    ).not.toHaveBeenCalled();
    expect(
      mockedTerminalBootstrapTokensApi.fetchTerminalBootstrapTokenAudits,
    ).not.toHaveBeenCalled();
    expect(result.current.directory).toEqual([]);
    expect(result.current.audits).toEqual([]);
    expect(result.current.selectedTerminal).toBeNull();
    expect(result.current.summaryRows).toEqual([
      { label: "终端目录", value: "0 台" },
      { label: "目标终端", value: "-" },
      { label: "详情面板", value: "已收起" },
    ]);
  });
});

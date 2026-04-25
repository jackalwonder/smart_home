import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackupManagementPanel } from "../BackupManagementPanel";
import { TerminalBootstrapTokenPanel } from "../TerminalBootstrapTokenPanel";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async () => "data:image/png;base64,test"),
  },
}));

afterEach(() => {
  cleanup();
});

describe("settings panel display formatting", () => {
  it("renders backup status and restore audit fields without raw enum labels", () => {
    const { container } = render(
      <BackupManagementPanel
        auditLoading={false}
        backups={
          [
            {
              backup_id: "backup_202604240101010000000001",
              comparison: {
                current_layout_version: "layout_20260424010101",
                current_settings_version: "settings_20260424010101",
                layout_matches_current: true,
                settings_matches_current: true,
              },
              created_at: "2026-04-24T01:01:01Z",
              created_by: "operator",
              note: "上线前",
              restored_at: null,
              status: "READY",
              summary: {
                favorite_count: 1,
                has_background_asset: true,
                has_function_settings: true,
                has_page_settings: true,
                hotspot_count: 2,
                layout_version: "layout_20260424010101",
                settings_version: "settings_20260424010101",
                snapshot_status: "READY",
              },
            },
          ] as never
        }
        canEdit
        createBusy={false}
        loading={false}
        message={null}
        note=""
        restoreAudits={
          [
            {
              audit_id: "audit_202604240202020000000001",
              backup_id: "backup_202604240101010000000001",
              error_code: null,
              error_message: null,
              failure_reason: null,
              layout_version: "layout_20260424020202",
              operator_id: "operator-id",
              operator_name: "operator",
              restored_at: "2026-04-24T02:02:02Z",
              result_status: "SUCCESS",
              settings_version: "settings_20260424020202",
              terminal_id: "terminal_1234567890abcdef",
            },
          ] as never
        }
        restoreBusyId={null}
        onChangeNote={vi.fn()}
        onCreateBackup={vi.fn()}
        onRefresh={vi.fn()}
        onRefreshAudits={vi.fn()}
        onRestoreBackup={vi.fn()}
      />,
    );

    expect(screen.getByText("可恢复")).toBeTruthy();
    expect(screen.getByText("可预览")).toBeTruthy();
    expect(screen.getByText("记录编号")).toBeTruthy();
    expect(screen.getByText("成功")).toBeTruthy();
    expect(container.textContent).not.toContain("READY");
    expect(container.textContent).not.toContain("SUCCESS");
    expect(container.textContent).not.toContain("审计 ID");
  });

  it("renders terminal token status and scope without raw enum labels", () => {
    const { container } = render(
      <TerminalBootstrapTokenPanel
        activationCode="activation-code"
        activationLink="https://example.test/activate"
        audits={
          [
            {
              acting_terminal_id: "acting_terminal_1234567890",
              acting_terminal_name: "控制台",
              action_type: "TERMINAL_BOOTSTRAP_TOKEN_CREATE",
              audit_id: "audit_202604240303030000000001",
              created_at: "2026-04-24T03:03:03Z",
              expires_at: "2026-04-24T04:03:03Z",
              operator_id: "operator-id",
              operator_name: "operator",
              result_status: "SUCCESS",
              rotated: false,
              terminal_code: "panel",
              terminal_name: "墙面屏",
            },
          ] as never
        }
        auditLoading={false}
        availableTerminals={
          [
            {
              expires_at: "2026-04-24T04:03:03Z",
              issued_at: "2026-04-24T03:03:03Z",
              last_used_at: null,
              terminal_code: "panel",
              terminal_id: "terminal_1234567890abcdef",
              terminal_mode: "ACTIVATED",
              terminal_name: "墙面屏",
              token_configured: true,
            },
          ] as never
        }
        canEdit
        createBusy={false}
        loading={false}
        message={null}
        revealedToken={
          {
            bootstrap_token: "secret-token",
            expires_at: "2026-04-24T04:03:03Z",
            rotated: false,
            scope: ["terminal:activate"],
          } as never
        }
        selectedTerminalId="terminal_1234567890abcdef"
        status={
          {
            expires_at: "2026-04-24T04:03:03Z",
            issued_at: "2026-04-24T03:03:03Z",
            last_used_at: null,
            terminal_code: "panel",
            terminal_id: "terminal_1234567890abcdef",
            terminal_mode: "ACTIVATED",
            terminal_name: "墙面屏",
            token_configured: true,
          } as never
        }
        onCopy={vi.fn()}
        onCopyActivationCode={vi.fn()}
        onCopyActivationLink={vi.fn()}
        onCreateOrReset={vi.fn()}
        onRefresh={vi.fn()}
        onRefreshAudits={vi.fn()}
        onSelectTerminalId={vi.fn()}
      />,
    );

    expect(screen.getByText("已激活")).toBeTruthy();
    expect(screen.getByText("终端激活")).toBeTruthy();
    expect(screen.getByText("创建")).toBeTruthy();
    expect(screen.getByText("记录编号")).toBeTruthy();
    expect(screen.getByText("成功")).toBeTruthy();
    expect(container.textContent).not.toContain("ACTIVATED");
    expect(container.textContent).not.toContain("terminal:activate");
    expect(container.textContent).not.toContain("TERMINAL_BOOTSTRAP_TOKEN_CREATE");
    expect(container.textContent).not.toContain("SUCCESS");
    expect(container.textContent).not.toContain("审计 ID");
  });
});

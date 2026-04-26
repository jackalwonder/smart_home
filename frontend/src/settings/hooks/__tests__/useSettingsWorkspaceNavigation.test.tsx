import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useSettingsWorkspaceNavigation } from "../useSettingsWorkspaceNavigation";

function renderNavigation(initialEntry: string) {
  const resetBackupDetails = vi.fn();
  const resetDeliveryDetails = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
  );
  const hook = renderHook(
    () =>
      useSettingsWorkspaceNavigation({
        resetBackupDetails,
        resetDeliveryDetails,
      }),
    { wrapper },
  );

  return { ...hook, resetBackupDetails, resetDeliveryDetails };
}

describe("useSettingsWorkspaceNavigation", () => {
  it("normalizes legacy section query values", async () => {
    const { result } = renderNavigation("/settings?section=system");

    await waitFor(() => {
      expect(result.current.activeSection).toBe("integrations");
    });
  });

  it("clears section-local UI state when moving across sections", async () => {
    const { result, resetBackupDetails, resetDeliveryDetails } = renderNavigation(
      "/settings?section=home",
    );

    act(() => {
      result.current.setShowAdvancedEditor(() => true);
    });
    expect(result.current.showAdvancedEditor).toBe(true);

    act(() => {
      result.current.handleSelectSection("terminal");
    });

    await waitFor(() => {
      expect(result.current.showAdvancedEditor).toBe(false);
    });
    expect(resetBackupDetails).toHaveBeenCalled();

    act(() => {
      result.current.handleSelectSection("overview");
    });

    await waitFor(() => {
      expect(resetDeliveryDetails).toHaveBeenCalled();
    });
  });
});

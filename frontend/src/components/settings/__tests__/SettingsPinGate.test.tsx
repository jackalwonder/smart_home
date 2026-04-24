import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPinGate } from "../SettingsPinGate";

afterEach(() => {
  cleanup();
});

describe("SettingsPinGate", () => {
  it("shows a compact PIN prompt without expanding the PIN panel", () => {
    render(
      <SettingsPinGate
        onToggle={vi.fn()}
        pinAccessPanel={<div>完整 PIN 面板</div>}
        pinActive={false}
        showPinManager={false}
      />,
    );

    expect(screen.getByText("部分管理能力需要 PIN")).toBeTruthy();
    expect(screen.getByText("验证 PIN")).toBeTruthy();
    expect(screen.queryByText("完整 PIN 面板")).toBeNull();
  });

  it("expands the PIN panel after the caller toggles it open", () => {
    render(
      <SettingsPinGate
        onToggle={vi.fn()}
        pinAccessPanel={<div>完整 PIN 面板</div>}
        pinActive={false}
        showPinManager
      />,
    );

    expect(screen.getByText("收起 PIN 面板")).toBeTruthy();
    expect(screen.getByText("完整 PIN 面板")).toBeTruthy();
  });

  it("does not render after PIN is active unless the manager is open", () => {
    const { rerender } = render(
      <SettingsPinGate
        onToggle={vi.fn()}
        pinAccessPanel={<div>完整 PIN 面板</div>}
        pinActive
        showPinManager={false}
      />,
    );

    expect(screen.queryByText("管理 PIN 已验证")).toBeNull();

    const onToggle = vi.fn();
    rerender(
      <SettingsPinGate
        onToggle={onToggle}
        pinAccessPanel={<div>完整 PIN 面板</div>}
        pinActive
        showPinManager
      />,
    );

    fireEvent.click(screen.getByText("收起 PIN 面板"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByText("完整 PIN 面板")).toBeTruthy();
  });
});

import { describe, expect, it, vi } from "vitest";
import { resolveEditorNoticeAction } from "../editorWorkbenchNoticeActions";

function controller(overrides: Partial<Parameters<typeof resolveEditorNoticeAction>[1]> = {}) {
  return {
    canAcquire: true,
    canTakeover: true,
    noticeActions: {
      acquire: vi.fn(),
      discard: vi.fn(),
      publish: vi.fn(),
      refresh: vi.fn(),
      save: vi.fn(),
      takeover: vi.fn(),
    },
    ...overrides,
  };
}

describe("editorWorkbenchNoticeActions", () => {
  it("maps retry actions to stable labels and handlers", () => {
    const target = controller();

    expect(resolveEditorNoticeAction("retry-publish", target)).toMatchObject({
      enabled: true,
      kind: "primary",
      label: "重新发布",
      run: target.noticeActions.publish,
    });
    expect(resolveEditorNoticeAction("retry-discard", target)).toMatchObject({
      enabled: true,
      kind: "ghost",
      label: "重新丢弃",
      run: target.noticeActions.discard,
    });
  });

  it("keeps acquire and takeover actions behind their capability flags", () => {
    const target = controller({ canAcquire: false, canTakeover: false });

    expect(resolveEditorNoticeAction("acquire", target)).toMatchObject({
      enabled: false,
      label: "重新申请编辑",
    });
    expect(resolveEditorNoticeAction("takeover", target)).toMatchObject({
      enabled: false,
      label: "接管当前锁",
    });
  });
});

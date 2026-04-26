import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type EditorDraftDto } from "../../../api/types";
import * as editorApi from "../../../api/editorApi";
import { appStore } from "../../../store/useAppStore";
import type { EditorDraftState } from "../../editorDraftState";
import { useEditorSessionFlow } from "../useEditorSessionFlow";

vi.mock("../../../api/editorApi", () => ({
  createEditorSession: vi.fn(),
  discardEditorDraft: vi.fn(),
  fetchEditorDraft: vi.fn(),
  heartbeatEditorSession: vi.fn(),
  publishEditorDraft: vi.fn(),
  saveEditorDraft: vi.fn(),
  takeoverEditorSession: vi.fn(),
}));

const mockedEditorApi = vi.mocked(editorApi);

const draftState: EditorDraftState = {
  backgroundAssetId: "background-1",
  backgroundImageUrl: "/assets/background-1.png",
  backgroundImageSize: { width: 1280, height: 720 },
  layoutMetaText: '{"theme":"night"}',
  hotspots: [
    {
      id: "hotspot-1",
      label: "Kitchen light",
      deviceId: "device-1",
      x: 32,
      y: 48,
      iconType: "device",
      iconAssetId: null,
      iconAssetUrl: null,
      labelMode: "AUTO",
      isVisible: true,
      structureOrder: 0,
    },
  ],
};

const grantedEditor = {
  lockStatus: "GRANTED",
  leaseId: "lease-1",
  leaseExpiresAt: "2026-04-24T12:00:00Z",
  heartbeatIntervalSeconds: 20,
  lockedByTerminalId: null,
  draft: { layout_meta: { theme: "night" }, hotspots: [] },
  draftVersion: "draft-1",
  baseLayoutVersion: "layout-1",
  readonly: false,
};

function makeDraftResponse(overrides: Partial<EditorDraftDto> = {}): EditorDraftDto {
  return {
    draft_exists: true,
    draft_version: "draft-2",
    base_layout_version: "layout-1",
    layout: {
      background_asset_id: "background-1",
      background_image_url: "/assets/background-1.png",
      layout_meta: { theme: "night" },
      hotspots: [],
    },
    lock_status: "GRANTED",
    readonly: false,
    ...overrides,
  };
}

function renderSessionFlow(
  overrides: Partial<Parameters<typeof useEditorSessionFlow>[0]> = {},
) {
  const resetSelection = vi.fn();
  const hook = renderHook(() =>
    useEditorSessionFlow({
      canEdit: true,
      draftState,
      editor: grantedEditor,
      events: [],
      pinActive: true,
      pinSessionActive: false,
      resetSelection,
      terminalId: null,
      ...overrides,
    }),
  );

  return { ...hook, resetSelection };
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  appStore.setEditorSession({
    lockStatus: "READ_ONLY",
    leaseId: null,
    leaseExpiresAt: null,
    heartbeatIntervalSeconds: null,
    lockedByTerminalId: null,
  });
  appStore.setEditorDraftData({
    draft: null,
    draftVersion: null,
    baseLayoutVersion: null,
    readonly: true,
    lockStatus: "READ_ONLY",
  });
  appStore.clearEditorError();
  mockedEditorApi.fetchEditorDraft.mockResolvedValue(makeDraftResponse());
  mockedEditorApi.createEditorSession.mockResolvedValue({
    lease_id: "lease-1",
    lease_expires_at: "2026-04-24T12:00:00Z",
    lock_status: "GRANTED",
    heartbeat_interval_seconds: 20,
    locked_by: null,
    granted: true,
    draft_version: "draft-1",
    current_layout_version: "layout-1",
  });
  mockedEditorApi.saveEditorDraft.mockResolvedValue({
    draft_version: "draft-2",
    lock_status: "GRANTED",
    preview_only: false,
    saved_to_draft: true,
  });
  mockedEditorApi.publishEditorDraft.mockResolvedValue({
    effective_at: "2026-04-24T12:01:00Z",
    layout_version: "layout-2",
    lock_released: true,
    published: true,
  });
  mockedEditorApi.takeoverEditorSession.mockResolvedValue({
    taken_over: true,
    new_lease_id: "lease-takeover",
    lease_expires_at: "2026-04-24T12:03:00Z",
    previous_terminal_id: "terminal-remote",
  });
  mockedEditorApi.heartbeatEditorSession.mockResolvedValue({
    lease_id: "lease-1",
    lease_expires_at: "2026-04-24T12:02:00Z",
    lock_status: "GRANTED",
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useEditorSessionFlow", () => {
  it("saves the editable draft and refreshes the persisted editor snapshot", async () => {
    const { result } = renderSessionFlow();

    await act(async () => {
      await result.current.handleSaveDraft();
    });

    expect(mockedEditorApi.saveEditorDraft).toHaveBeenCalledWith({
      lease_id: "lease-1",
      draft_version: "draft-1",
      base_layout_version: "layout-1",
      background_asset_id: "background-1",
      layout_meta: {
        theme: "night",
        hotspot_labels: {
          "hotspot-1": "Kitchen light",
        },
      },
      hotspots: [
        {
          hotspot_id: "hotspot-1",
          device_id: "device-1",
          x: 32,
          y: 48,
          icon_type: "device",
          icon_asset_id: null,
          label_mode: "AUTO",
          is_visible: true,
          structure_order: 0,
        },
      ],
    });
    expect(mockedEditorApi.fetchEditorDraft).toHaveBeenCalledWith("lease-1");
    expect(appStore.getSnapshot().editor.draftVersion).toBe("draft-2");
    expect(result.current.editorNotice?.title).toBe("草稿已保存");
  });

  it("publishes only after saving against the refreshed draft version", async () => {
    const refreshedDraft = makeDraftResponse({
      draft_version: "draft-saved",
      base_layout_version: "layout-saved",
    });
    const readonlyDraft = makeDraftResponse({
      draft_version: "draft-published",
      base_layout_version: "layout-2",
      lock_status: "READ_ONLY",
      readonly: true,
    });
    mockedEditorApi.fetchEditorDraft
      .mockResolvedValueOnce(refreshedDraft)
      .mockResolvedValueOnce(readonlyDraft);
    const { result, resetSelection } = renderSessionFlow();

    await act(async () => {
      await result.current.handlePublishDraft();
    });

    expect(mockedEditorApi.saveEditorDraft).toHaveBeenCalledOnce();
    expect(mockedEditorApi.publishEditorDraft).toHaveBeenCalledWith({
      lease_id: "lease-1",
      draft_version: "draft-saved",
      base_layout_version: "layout-saved",
    });
    expect(mockedEditorApi.fetchEditorDraft).toHaveBeenLastCalledWith(undefined);
    expect(resetSelection).toHaveBeenCalledOnce();
    expect(appStore.getSnapshot().editor.lockStatus).toBe("READ_ONLY");
    expect(result.current.editorNotice?.title).toBe("草稿已发布");
  });

  it("recovers a terminal mismatch lock loss into locked-by-other state", async () => {
    mockedEditorApi.fetchEditorDraft.mockResolvedValueOnce(
      makeDraftResponse({
        lock_status: "LOCKED_BY_OTHER",
        readonly: true,
      }),
    );
    const { result } = renderSessionFlow();

    await act(async () => {
      await result.current.handleEditorActionError(
        new ApiError({
          code: "DRAFT_LOCK_LOST",
          message: "lock lost",
          details: {
            reason: "TERMINAL_MISMATCH",
            active_lease: {
              lease_id: "lease-remote",
              terminal_id: "terminal-remote",
              lease_expires_at: "2026-04-24T12:05:00Z",
            },
          },
        }),
        "save",
      );
    });

    expect(mockedEditorApi.fetchEditorDraft).toHaveBeenCalledWith(undefined);
    expect(appStore.getSnapshot().editor).toEqual(
      expect.objectContaining({
        lockStatus: "LOCKED_BY_OTHER",
        leaseId: "lease-remote",
        lockedByTerminalId: "terminal-remote",
        readonly: true,
      }),
    );
    expect(result.current.editorNotice).toEqual(
      expect.objectContaining({
        tone: "warning",
        title: "保存前失去编辑租约",
        actions: ["refresh", "takeover"],
      }),
    );
  });

  it("renews a granted lease on the configured heartbeat cadence", async () => {
    vi.useFakeTimers();
    renderSessionFlow({
      editor: {
        ...grantedEditor,
        heartbeatIntervalSeconds: 8,
      },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });

    expect(mockedEditorApi.heartbeatEditorSession).toHaveBeenCalledWith("lease-1");
    expect(appStore.getSnapshot().editor.leaseExpiresAt).toBe("2026-04-24T12:02:00Z");
  });

  it("loads a readonly draft when a terminal becomes available without an active PIN session", async () => {
    renderSessionFlow({
      editor: {
        ...grantedEditor,
        lockStatus: "READ_ONLY",
        leaseId: null,
        readonly: true,
      },
      pinSessionActive: false,
      terminalId: "terminal-1",
    });

    await waitFor(() => {
      expect(mockedEditorApi.fetchEditorDraft).toHaveBeenCalledOnce();
    });
    expect(appStore.getSnapshot().editor).toEqual(
      expect.objectContaining({
        draftVersion: "draft-2",
        lockStatus: "GRANTED",
      }),
    );
  });

  it("opens an editable session automatically when the PIN session is active", async () => {
    renderSessionFlow({
      pinSessionActive: true,
      terminalId: "terminal-1",
    });

    await waitFor(() => {
      expect(mockedEditorApi.createEditorSession).toHaveBeenCalledOnce();
    });
    expect(mockedEditorApi.fetchEditorDraft).toHaveBeenCalledWith("lease-1");
    expect(appStore.getSnapshot().editor).toEqual(
      expect.objectContaining({
        draftVersion: "draft-2",
        leaseId: "lease-1",
        lockStatus: "GRANTED",
      }),
    );
  });

  it("refreshes and offers retry when a publish hits a version conflict", async () => {
    const { result } = renderSessionFlow();

    await act(async () => {
      await result.current.handleEditorActionError(
        new ApiError({
          code: "VERSION_CONFLICT",
          message: "version conflict",
          details: {
            current: { draft_version: "draft-remote" },
            submitted: { draft_version: "draft-1" },
          },
        }),
        "publish",
      );
    });

    expect(mockedEditorApi.fetchEditorDraft).toHaveBeenCalledWith("lease-1");
    expect(result.current.editorNotice).toEqual(
      expect.objectContaining({
        actions: ["retry-publish"],
        title: "发布前草稿版本已更新",
        tone: "warning",
      }),
    );
  });

  it("keeps the editor lease when publish fails after the draft save succeeds", async () => {
    appStore.setEditorSession({
      lockStatus: "GRANTED",
      leaseId: "lease-1",
      leaseExpiresAt: "2026-04-24T12:00:00Z",
      heartbeatIntervalSeconds: 20,
      lockedByTerminalId: null,
    });
    mockedEditorApi.fetchEditorDraft.mockResolvedValueOnce(
      makeDraftResponse({
        draft_version: "draft-saved",
        base_layout_version: "layout-saved",
      }),
    );
    mockedEditorApi.publishEditorDraft.mockRejectedValueOnce(
      new ApiError({ code: "UPSTREAM_ERROR", message: "publish failed" }),
    );
    const { result } = renderSessionFlow();

    await act(async () => {
      await result.current.handlePublishDraft();
    });

    expect(mockedEditorApi.saveEditorDraft).toHaveBeenCalledOnce();
    expect(mockedEditorApi.publishEditorDraft).toHaveBeenCalledOnce();
    expect(appStore.getSnapshot().editor.lockStatus).toBe("GRANTED");
    expect(result.current.editorNotice).toEqual(
      expect.objectContaining({
        title: "发布草稿失败",
        tone: "error",
      }),
    );
  });

  it("does not reopen an editable session after publish updates the editor snapshot", async () => {
    const resetSelection = vi.fn();
    const options: Parameters<typeof useEditorSessionFlow>[0] = {
      canEdit: true,
      draftState,
      editor: grantedEditor,
      events: [],
      pinActive: true,
      pinSessionActive: true,
      resetSelection,
      terminalId: "terminal-1",
    };
    const { result, rerender } = renderHook(() => useEditorSessionFlow(options));

    await waitFor(() => {
      expect(mockedEditorApi.createEditorSession).toHaveBeenCalledOnce();
    });
    vi.clearAllMocks();

    await act(async () => {
      await result.current.handlePublishDraft();
    });
    expect(result.current.editorNotice?.title).toBe("草稿已发布");

    options.editor = {
      ...grantedEditor,
      lockStatus: "READ_ONLY",
      leaseId: null,
      readonly: true,
      draftVersion: "draft-published",
      baseLayoutVersion: "layout-2",
    };
    rerender();

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedEditorApi.createEditorSession).not.toHaveBeenCalled();
    expect(result.current.editorNotice?.title).toBe("草稿已发布");
  });

  it("keeps the takeover success notice when the editor snapshot changes", async () => {
    const resetSelection = vi.fn();
    const options: Parameters<typeof useEditorSessionFlow>[0] = {
      canEdit: true,
      draftState,
      editor: grantedEditor,
      events: [],
      pinActive: true,
      pinSessionActive: true,
      resetSelection,
      terminalId: "terminal-1",
    };
    const { result, rerender } = renderHook(() => useEditorSessionFlow(options));

    await waitFor(() => {
      expect(mockedEditorApi.createEditorSession).toHaveBeenCalledOnce();
    });
    vi.clearAllMocks();

    options.editor = {
      ...grantedEditor,
      lockStatus: "LOCKED_BY_OTHER",
      leaseId: "lease-remote",
      lockedByTerminalId: "terminal-remote",
      readonly: true,
    };
    rerender();

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedEditorApi.createEditorSession).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleTakeover();
    });
    expect(result.current.editorNotice?.title).toBe("已接管编辑租约");

    options.editor = {
      ...grantedEditor,
      leaseId: "lease-takeover",
    };
    rerender();

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedEditorApi.createEditorSession).not.toHaveBeenCalled();
    expect(result.current.editorNotice?.title).toBe("已接管编辑租约");
  });

  it("recovers draft takeover realtime events into locked-by-other state", async () => {
    const resetSelection = vi.fn();
    const options: Parameters<typeof useEditorSessionFlow>[0] = {
      canEdit: true,
      draftState,
      editor: grantedEditor,
      events: [],
      pinActive: true,
      pinSessionActive: false,
      resetSelection,
      terminalId: "terminal-1",
    };
    const { rerender } = renderHook(() => useEditorSessionFlow(options));

    await waitFor(() => {
      expect(mockedEditorApi.fetchEditorDraft).toHaveBeenCalledOnce();
    });
    vi.clearAllMocks();
    options.events = [
      {
        change_domain: "EDITOR_LOCK",
        event_id: "event-1",
        event_type: "draft_taken_over",
        home_id: "home",
        occurred_at: "2026-04-24T12:00:00Z",
        payload: {
          new_lease_id: "lease-remote",
          new_terminal_id: "terminal-remote",
          previous_terminal_id: "terminal-1",
        },
        sequence: 1,
        snapshot_required: false,
      },
    ];
    rerender();

    await waitFor(() => {
      expect(appStore.getSnapshot().editor.lockStatus).toBe("LOCKED_BY_OTHER");
    });
    expect(appStore.getSnapshot().editor.lockedByTerminalId).toBe("terminal-remote");
    expect(mockedEditorApi.fetchEditorDraft).toHaveBeenCalledWith("lease-remote");
  });
});

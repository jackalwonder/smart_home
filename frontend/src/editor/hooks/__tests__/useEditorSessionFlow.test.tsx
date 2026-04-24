import { act, cleanup, renderHook } from "@testing-library/react";
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

    expect(mockedEditorApi.heartbeatEditorSession).toHaveBeenCalledWith(
      "lease-1",
    );
    expect(appStore.getSnapshot().editor.leaseExpiresAt).toBe(
      "2026-04-24T12:02:00Z",
    );
  });
});

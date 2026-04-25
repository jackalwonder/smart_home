import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type EditorDraftDto } from "../../../api/types";
import * as editorApi from "../../../api/editorApi";
import { appStore } from "../../../store/useAppStore";
import { useHomeStageEditorSession } from "../useHomeStageEditorSession";

vi.mock("../../../api/editorApi", () => ({
  createEditorSession: vi.fn(),
  fetchEditorDraft: vi.fn(),
  heartbeatEditorSession: vi.fn(),
  publishEditorDraft: vi.fn(),
  saveEditorDraft: vi.fn(),
}));

const mockedEditorApi = vi.mocked(editorApi);

function makeDraftResponse(overrides: Partial<EditorDraftDto> = {}): EditorDraftDto {
  return {
    draft_exists: true,
    draft_version: "draft-1",
    base_layout_version: "layout-1",
    layout: {
      background_asset_id: "background-1",
      background_image_url: "/assets/background-1.png",
      layout_meta: { theme: "night" },
      hotspots: [
        {
          hotspot_id: "hotspot-1",
          device_id: "device-1",
          x: 0.25,
          y: 0.5,
          icon_type: "device",
          icon_asset_id: null,
          label_mode: "AUTO",
          is_visible: true,
          structure_order: 0,
          display_name: "Lamp",
        },
      ],
    },
    lock_status: "GRANTED",
    readonly: false,
    ...overrides,
  };
}

function renderSessionHook(options: {
  onApplied?: () => Promise<void> | void;
  onExit?: () => void;
  onOpenAdvancedSettings?: () => void;
  pinActive?: boolean;
} = {}) {
  return renderHook(() =>
    useHomeStageEditorSession({
      onApplied: options.onApplied ?? vi.fn(),
      onExit: options.onExit ?? vi.fn(),
      onOpenAdvancedSettings: options.onOpenAdvancedSettings ?? vi.fn(),
      pinActive: options.pinActive ?? true,
    }),
  );
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
  mockedEditorApi.createEditorSession.mockResolvedValue({
    heartbeat_interval_seconds: 20,
    lease_expires_at: "2026-04-24T12:00:00Z",
    lease_id: "lease-1",
    granted: true,
    lock_status: "GRANTED",
    locked_by: null,
    draft_version: "draft-1",
    current_layout_version: "layout-1",
  });
  mockedEditorApi.fetchEditorDraft.mockResolvedValue(makeDraftResponse());
  mockedEditorApi.heartbeatEditorSession.mockResolvedValue({
    lease_id: "lease-1",
    lease_expires_at: "2026-04-24T12:01:00Z",
    lock_status: "GRANTED",
  });
  mockedEditorApi.saveEditorDraft.mockResolvedValue({
    draft_version: "draft-2",
    lock_status: "GRANTED",
    preview_only: false,
    saved_to_draft: true,
  });
  mockedEditorApi.publishEditorDraft.mockResolvedValue({
    effective_at: "2026-04-24T12:02:00Z",
    layout_version: "layout-2",
    lock_released: true,
    published: true,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useHomeStageEditorSession", () => {
  it("shows a PIN notice without opening an editor session", async () => {
    const { result } = renderSessionHook({ pinActive: false });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedEditorApi.createEditorSession).not.toHaveBeenCalled();
    expect(result.current.notice).toEqual(
      expect.objectContaining({
        tone: "warning",
        title: "需要管理 PIN",
      }),
    );
  });

  it("opens the light editor session and loads draft state", async () => {
    const { result } = renderSessionHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedEditorApi.createEditorSession).toHaveBeenCalledOnce();
    expect(mockedEditorApi.fetchEditorDraft).toHaveBeenCalledWith("lease-1");
    expect(result.current.canEdit).toBe(true);
    expect(result.current.draftState.hotspots[0].label).toBe("Lamp");
    expect(result.current.draftResetKey).toBe(1);
  });

  it("renews a granted light editor lease", async () => {
    vi.useFakeTimers();
    const { result } = renderSessionHook();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(mockedEditorApi.heartbeatEditorSession).toHaveBeenCalledWith("lease-1");
    expect(appStore.getSnapshot().editor.leaseExpiresAt).toBe(
      "2026-04-24T12:01:00Z",
    );
  });

  it("keeps conflict save failures in the light editor warning state", async () => {
    mockedEditorApi.saveEditorDraft.mockRejectedValueOnce(new ApiError({
      code: "VERSION_CONFLICT",
      message: "version conflict",
    }));
    const { result } = renderSessionHook();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.setDraftState((current) => ({
        ...current,
        layoutMetaText: '{"theme":"day"}',
      }));
    });
    await act(async () => {
      await result.current.persistDraft();
    });

    expect(result.current.notice).toEqual(
      expect.objectContaining({
        tone: "warning",
        title: "请前往首页高级设置继续处理",
      }),
    );
  });

  it("saves before publishing and exits after apply succeeds", async () => {
    const onApplied = vi.fn();
    const onExit = vi.fn();
    mockedEditorApi.fetchEditorDraft
      .mockResolvedValueOnce(makeDraftResponse({ draft_version: "draft-1" }))
      .mockResolvedValueOnce(
        makeDraftResponse({
          draft_version: "draft-2",
          base_layout_version: "layout-1",
        }),
      );
    const { result } = renderSessionHook({ onApplied, onExit });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleApplyChanges();
    });

    expect(mockedEditorApi.saveEditorDraft).toHaveBeenCalledOnce();
    expect(mockedEditorApi.publishEditorDraft).toHaveBeenCalledWith({
      lease_id: "lease-1",
      draft_version: "draft-2",
      base_layout_version: "layout-1",
    });
    expect(onApplied).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledOnce();
  });
});

import { useState } from "react";
import { uploadFloorplanAsset, uploadHotspotIconAsset } from "../api/pageAssetsApi";
import { type EditorActionKind } from "../editor/editorWorkbenchNotices";
import { type EditorDraftStateUpdater } from "../editor/editorDraftState";
import { normalizeImageSize } from "./editorWorkbenchModel";

interface UseEditorAssetUploadsOptions {
  canEdit: boolean;
  clearEditorFeedback: () => void;
  handleEditorActionError: (error: unknown, action: EditorActionKind) => Promise<void>;
  selectedHotspotId: string | null;
  showEditorNotice: (notice: {
    tone: "success" | "warning" | "error";
    title: string;
    detail: string;
  }) => void;
  updateDraftStateWithHistory: (
    updater: EditorDraftStateUpdater,
    label: string,
    groupKey?: string,
  ) => void;
}

export function useEditorAssetUploads({
  canEdit,
  clearEditorFeedback,
  handleEditorActionError,
  selectedHotspotId,
  showEditorNotice,
  updateDraftStateWithHistory,
}: UseEditorAssetUploadsOptions) {
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [isUploadingHotspotIcon, setIsUploadingHotspotIcon] = useState(false);

  async function handleUploadBackground(file: File) {
    if (!canEdit) {
      return;
    }

    clearEditorFeedback();
    setIsUploadingBackground(true);
    try {
      const uploaded = await uploadFloorplanAsset({ file, replaceCurrent: false });
      updateDraftStateWithHistory(
        (current) => ({
          ...current,
          backgroundAssetId: uploaded.asset_id,
          backgroundImageUrl: uploaded.background_image_url,
          backgroundImageSize: normalizeImageSize(uploaded.background_image_size),
        }),
        "更新背景图",
      );
      showEditorNotice({
        tone: "success",
        title: "背景图已更新",
        detail: "图片已上传并应用到当前草稿。保存草稿后会写入后端，发布后进入首页布局。",
      });
    } catch (error) {
      await handleEditorActionError(error, "upload");
    } finally {
      setIsUploadingBackground(false);
    }
  }

  async function handleUploadHotspotIcon(file: File) {
    if (!canEdit || !selectedHotspotId) {
      return;
    }

    clearEditorFeedback();
    setIsUploadingHotspotIcon(true);
    try {
      const uploaded = await uploadHotspotIconAsset({ file });
      updateDraftStateWithHistory(
        (current) => ({
          ...current,
          hotspots: current.hotspots.map((hotspot) =>
            hotspot.id === selectedHotspotId
              ? {
                  ...hotspot,
                  iconAssetId: uploaded.asset_id,
                  iconAssetUrl: uploaded.icon_asset_url,
                }
              : hotspot,
          ),
        }),
        "Upload hotspot icon",
      );
      showEditorNotice({
        tone: "success",
        title: "Hotspot icon uploaded",
        detail:
          "The custom icon is attached to the selected hotspot. Save and publish to use it on the home page.",
      });
    } catch (error) {
      await handleEditorActionError(error, "upload");
    } finally {
      setIsUploadingHotspotIcon(false);
    }
  }

  return {
    handleUploadBackground,
    handleUploadHotspotIcon,
    isUploadingBackground,
    isUploadingHotspotIcon,
  };
}

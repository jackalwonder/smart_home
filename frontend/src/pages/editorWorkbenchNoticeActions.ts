import { type EditorNoticeAction } from "../editor/editorWorkbenchNotices";

interface EditorNoticeActionController {
  canAcquire: boolean;
  canTakeover: boolean;
  noticeActions: {
    acquire: () => void;
    discard: () => void;
    publish: () => void;
    refresh: () => void;
    save: () => void;
    takeover: () => void;
  };
}

export function resolveEditorNoticeAction(
  action: EditorNoticeAction,
  controller: EditorNoticeActionController,
) {
  switch (action) {
    case "refresh":
      return {
        enabled: true,
        kind: "ghost" as const,
        label: "刷新草稿",
        run: controller.noticeActions.refresh,
      };
    case "retry-save":
      return {
        enabled: true,
        kind: "primary" as const,
        label: "重新保存",
        run: controller.noticeActions.save,
      };
    case "retry-publish":
      return {
        enabled: true,
        kind: "primary" as const,
        label: "重新发布",
        run: controller.noticeActions.publish,
      };
    case "retry-acquire":
    case "acquire":
      return {
        enabled: controller.canAcquire,
        kind: "ghost" as const,
        label: "重新申请编辑",
        run: controller.noticeActions.acquire,
      };
    case "retry-takeover":
    case "takeover":
      return {
        enabled: controller.canTakeover,
        kind: "primary" as const,
        label: "接管当前锁",
        run: controller.noticeActions.takeover,
      };
    case "retry-discard":
      return {
        enabled: true,
        kind: "ghost" as const,
        label: "重新丢弃",
        run: controller.noticeActions.discard,
      };
  }
}

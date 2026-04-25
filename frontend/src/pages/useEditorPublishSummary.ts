import { useEffect, useState } from "react";
import { previewEditorDraftDiff } from "../api/editorApi";
import { buildDraftDiffInput, type EditorDraftState } from "../editor/editorDraftState";
import {
  buildLocalPublishSummary,
  mapPublishSummary,
  type EditorPublishSummaryViewModel,
} from "./editorWorkbenchModel";

export function useEditorPublishSummary(
  draftState: EditorDraftState,
  publishBaseline: EditorDraftState | null,
  baseLayoutVersion: string | null,
) {
  const [publishSummary, setPublishSummary] = useState<EditorPublishSummaryViewModel>({
    items: [],
    totalChanges: 0,
  });
  const [publishSummaryLoading, setPublishSummaryLoading] = useState(false);
  const [publishSummaryError, setPublishSummaryError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer = 0;

    timer = window.setTimeout(() => {
      void (async () => {
        try {
          const diffInput = buildDraftDiffInput(draftState, baseLayoutVersion);
          if (!active) {
            return;
          }
          setPublishSummaryLoading(true);
          setPublishSummaryError(null);
          const diff = await previewEditorDraftDiff(diffInput);
          if (!active) {
            return;
          }
          setPublishSummary(mapPublishSummary(diff));
        } catch (error) {
          if (!active) {
            return;
          }
          setPublishSummary({ items: [], totalChanges: 0 });
          setPublishSummaryError(
            error instanceof SyntaxError
              ? "布局元数据暂时不可解析，发布前摘要不可用。"
              : "暂时无法读取后端发布摘要，请稍后重试。",
          );
        } finally {
          if (active) {
            setPublishSummaryLoading(false);
          }
        }
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [baseLayoutVersion, draftState]);

  const localPublishSummary = buildLocalPublishSummary(draftState, publishBaseline);
  const effectivePublishSummary =
    publishSummary.totalChanges > 0 ? publishSummary : localPublishSummary;
  const effectivePublishSummaryError =
    effectivePublishSummary.totalChanges > 0 ? null : publishSummaryError;
  const effectivePublishSummaryLoading =
    publishSummaryLoading && effectivePublishSummary.totalChanges === 0;

  return {
    effectivePublishSummary,
    effectivePublishSummaryError,
    effectivePublishSummaryLoading,
  };
}

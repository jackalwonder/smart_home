import type { ComponentProps } from "react";
import { EditorCanvasWorkspace } from "../components/editor/EditorCanvasWorkspace";
import { EditorCommandBar } from "../components/editor/EditorCommandBar";
import { EditorInspector } from "../components/editor/EditorInspector";
import { EditorPublishSummary } from "../components/editor/EditorPublishSummary";
import { EditorToolbox } from "../components/editor/EditorToolbox";

export interface EditorWorkbenchPropsBundle {
  canvasProps: ComponentProps<typeof EditorCanvasWorkspace>;
  commandBarProps: ComponentProps<typeof EditorCommandBar>;
  inspectorProps: ComponentProps<typeof EditorInspector>;
  publishSummaryProps: ComponentProps<typeof EditorPublishSummary>;
  toolboxProps: ComponentProps<typeof EditorToolbox>;
}

export function buildEditorWorkbenchProps(input: EditorWorkbenchPropsBundle) {
  return input;
}

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const pagesRoot = join(srcRoot, "pages");
const homeRoot = join(srcRoot, "components", "home");
const pageComponentPattern = /(Page|Workspace)\.tsx$/;

function pageComponentFiles() {
  return readdirSync(pagesRoot)
    .filter((fileName) => pageComponentPattern.test(fileName))
    .map((fileName) => join(pagesRoot, fileName));
}

describe("frontend architecture boundaries", () => {
  it("keeps page components behind API hooks and adapters", () => {
    const violations = pageComponentFiles().flatMap((filePath) => {
      const source = readFileSync(filePath, "utf-8");
      const relativePath = filePath.slice(srcRoot.length + 1);
      const fileViolations: string[] = [];

      if (source.match(/from\s+["'][^"']*\/api\//)) {
        fileViolations.push(`${relativePath}: imports API modules directly`);
      }
      if (source.includes("fetch(")) {
        fileViolations.push(`${relativePath}: calls fetch directly`);
      }
      if (source.includes('"/api/') || source.includes("'/api/")) {
        fileViolations.push(`${relativePath}: hard-codes an API path`);
      }
      if (source.includes("Record<string, unknown>")) {
        fileViolations.push(`${relativePath}: consumes unadapted record-shaped data`);
      }

      return fileViolations;
    });

    expect(violations).toEqual([]);
  });

  it("keeps home control components behind the shared control flow hook", () => {
    const constrainedFiles = [
      join(homeRoot, "HomeClusterControlModal.tsx"),
      join(homeRoot, "ClusterDeviceCard.tsx"),
      join(homeRoot, "ClusterModeControls.tsx"),
      join(homeRoot, "ClusterPowerControls.tsx"),
      join(homeRoot, "ClusterRangeControl.tsx"),
      join(homeRoot, "HomeDeviceControlPanel.tsx"),
    ];
    const violations = constrainedFiles.flatMap((filePath) => {
      const source = readFileSync(filePath, "utf-8");
      const relativePath = filePath.slice(srcRoot.length + 1);
      const fileViolations: string[] = [];

      if (source.match(/from\s+["'][^"']*\/api\//)) {
        fileViolations.push(`${relativePath}: imports API modules directly`);
      }
      if (source.includes("deviceControlsApi") || source.includes("devicesApi")) {
        fileViolations.push(`${relativePath}: bypasses useDeviceControlFlow`);
      }

      return fileViolations;
    });

    expect(violations).toEqual([]);
  });
});

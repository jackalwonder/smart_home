import { describe, expect, it } from "vitest";
import type { PolicyEntryDraft } from "../StructuredPolicyEditor";
import {
  findOriginalIndex,
  getBoolean,
  getString,
  getUnknownEntries,
  knownHomepageKeys,
} from "../pageSettingsPolicyModel";

function entry(input: Partial<PolicyEntryDraft> & Pick<PolicyEntryDraft, "id" | "key">) {
  return {
    type: "string",
    value: "",
    ...input,
  } as PolicyEntryDraft;
}

describe("pageSettingsPolicyModel", () => {
  it("reads typed policy defaults and filters unknown extension entries", () => {
    const entries = [
      entry({ id: "weather", key: "show_weather", type: "boolean", value: "true" }),
      entry({ id: "density", key: "stage_density", value: "compact" }),
      entry({ id: "custom", key: "custom_badge", value: "enabled" }),
    ];

    expect(getBoolean(entries, "show_weather")).toBe(true);
    expect(getBoolean(entries, "missing", true)).toBe(true);
    expect(getString(entries, "stage_density", "immersive")).toBe("compact");
    expect(getString(entries, "missing", "fallback")).toBe("fallback");
    expect(getUnknownEntries(entries, knownHomepageKeys).map((item) => item.key)).toEqual([
      "custom_badge",
    ]);
    expect(findOriginalIndex(entries, "custom")).toBe(2);
  });
});

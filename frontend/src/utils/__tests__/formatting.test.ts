import { describe, expect, it } from "vitest";
import { formatDateTime, formatShortId, formatValue } from "../formatting";

describe("formatting utilities", () => {
  describe("formatDateTime", () => {
    it("returns '-' for null or undefined", () => {
      expect(formatDateTime(null)).toBe("-");
      expect(formatDateTime(undefined)).toBe("-");
    });

    it("returns the raw value when parsing produces NaN", () => {
      expect(formatDateTime("not-a-date")).toBe("not-a-date");
    });

    it("formats a valid ISO date", () => {
      const result = formatDateTime("2025-06-15T08:30:00Z");
      expect(result).not.toBe("-");
      expect(result).toMatch(/2025/);
    });
  });

  describe("formatShortId", () => {
    it("returns '-' for null or undefined", () => {
      expect(formatShortId(null)).toBe("-");
      expect(formatShortId(undefined)).toBe("-");
    });

    it("returns short strings as-is", () => {
      expect(formatShortId("ab")).toBe("ab");
    });

    it("truncates long ids with default length 12", () => {
      expect(formatShortId("1234567890abcdef")).toMatch(/^\.{3}/);
    });

    it("respects custom maxLength and suffixLength", () => {
      const id = "12345678901234567890";
      expect(formatShortId(id)).toMatch(/^\.{3}.{8}$/);
      expect(formatShortId(id, 14, 10)).toMatch(/^\.{3}.{10}$/);
    });
  });

  describe("formatValue", () => {
    it("returns '-' for null, undefined, or empty string", () => {
      expect(formatValue(null)).toBe("-");
      expect(formatValue(undefined)).toBe("-");
    });

    it("returns the value as a string", () => {
      expect(formatValue("ready")).toBe("ready");
    });
  });
});

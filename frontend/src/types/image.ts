export interface ImageSize {
  width: number | null;
  height: number | null;
}

export function hasImageSize(
  value: ImageSize | null | undefined,
): value is { width: number; height: number } {
  return Boolean(
    value &&
      typeof value.width === "number" &&
      typeof value.height === "number" &&
      Number.isFinite(value.width) &&
      Number.isFinite(value.height) &&
      value.width > 0 &&
      value.height > 0,
  );
}

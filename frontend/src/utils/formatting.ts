export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export function formatShortId(
  value: string | null | undefined,
  maxLength: number = 12,
  suffixLength: number = 8,
) {
  if (!value) {
    return "-";
  }
  return value.length > maxLength ? `...${value.slice(-suffixLength)}` : value;
}

export function formatValue(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  return value;
}

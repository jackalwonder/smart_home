export function buildDeviceHotspotId(deviceId: string) {
  const normalized = deviceId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
  return `draft-device-${normalized}-${Date.now()}`;
}

export function getNextHotspotPosition(index: number) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: Math.min(0.2 + column * 0.2, 0.8),
    y: Math.min(0.25 + row * 0.16, 0.85),
  };
}

export function clampPosition(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

export function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

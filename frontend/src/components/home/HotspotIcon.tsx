import {
  deriveHotspotIconKey,
  isHotspotRunning,
  shouldSpinHotspotIcon,
} from "../../utils/hotspotIcons";

interface HotspotIconProps {
  iconType: string | null | undefined;
  iconAssetUrl?: string | null;
  deviceType?: string | null;
  status?: string | null;
  isOffline?: boolean;
  variant?: "default" | "home" | "editor-preview";
  className?: string;
}

const iconPaths: Record<string, string[]> = {
  lightbulb: [
    "M9 18h6",
    "M10 22h4",
    "M12 2a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.5 1.1 2.2h5c0-.7.3-1.6 1.1-2.2A6 6 0 0 0 12 2Z",
  ],
  fan: [
    "M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
    "M12 10c-1.5-3.9.3-6.7 3-7.5 1.5-.5 3 1 2.5 2.5-.8 2.7-3.6 4.5-5.5 5",
    "M14 12c3.9-1.5 6.7.3 7.5 3 .5 1.5-1 3-2.5 2.5-2.7-.8-4.5-3.6-5-5.5",
    "M10 12c-3.9 1.5-6.7-.3-7.5-3C2 7.5 3.5 6 5 6.5c2.7.8 4.5 3.6 5 5.5",
    "M12 14c1.5 3.9-.3 6.7-3 7.5-1.5.5-3-1-2.5-2.5.8-2.7 3.6-4.5 5.5-5",
  ],
  "air-vent": [
    "M6 12h12",
    "M6 8h12",
    "M6 16h12",
    "M8 4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z",
  ],
  refrigerator: [
    "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z",
    "M5 10h14",
    "M9 6v1",
    "M9 14v1",
  ],
  thermometer: [
    "M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z",
    "M12 6v8",
  ],
  blinds: [
    "M4 4h16",
    "M5 8h14",
    "M5 12h14",
    "M5 16h14",
    "M12 4v16",
    "M8 20h8",
  ],
  tv: [
    "M7 21h10",
    "M12 17v4",
    "M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  ],
  sensor: [
    "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
    "M4.9 4.9a10 10 0 0 0 0 14.2",
    "M19.1 4.9a10 10 0 0 1 0 14.2",
    "M7.8 7.8a6 6 0 0 0 0 8.4",
    "M16.2 7.8a6 6 0 0 1 0 8.4",
  ],
  switch: [
    "M9 12h6",
    "M12 9v6",
    "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z",
  ],
  device: [
    "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
    "M9 7h6",
    "M9 11h6",
    "M12 17h.01",
  ],
};

export function HotspotIcon({
  iconType,
  iconAssetUrl,
  deviceType,
  status,
  isOffline = false,
  variant = "default",
  className,
}: HotspotIconProps) {
  const iconKey = deriveHotspotIconKey(iconType, deviceType);
  const paths = iconPaths[iconKey] ?? iconPaths.device;
  const running = isHotspotRunning(status, isOffline);
  const spinning = shouldSpinHotspotIcon({ iconType, deviceType, status, isOffline });
  const classes = [
    "hotspot-icon",
    `hotspot-icon--${iconKey}`,
    `hotspot-icon--variant-${variant}`,
    running ? "is-active" : "",
    spinning ? "is-spinning" : "",
    isOffline ? "is-offline" : "",
    iconAssetUrl ? "has-custom-icon" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (iconAssetUrl) {
    return (
      <i aria-hidden="true" className={classes} data-icon-key={iconKey}>
        <img alt="" src={iconAssetUrl} />
      </i>
    );
  }

  return (
    <i aria-hidden="true" className={classes} data-icon-key={iconKey}>
      <svg
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        {paths.map((path) => (
          <path d={path} key={path} />
        ))}
      </svg>
    </i>
  );
}

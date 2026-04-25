import { DeviceDetailDto } from "../../api/types";
import { HomeHotspotViewModel } from "../../view-models/home";
import {
  controlSchemaKey,
  formatPowerStateLabel,
  isPowerControlSchema,
  isRuntimePowerOn,
} from "./deviceControlHelpers";
import { HotspotIcon } from "./HotspotIcon";
import { detailState, type DeviceCandidate } from "./homeHotspotControlModel";

interface HotspotGroupControlsProps {
  activeHotspot: HomeHotspotViewModel;
  detailsById: Map<string, DeviceDetailDto>;
  loading: boolean;
  messages: Record<string, string>;
  optimisticPower: Record<string, boolean>;
  pending: Record<string, boolean>;
  targetCandidates: DeviceCandidate[];
  toggleDevice: (candidate: DeviceCandidate, detail: DeviceDetailDto) => void;
}

export function HotspotGroupControls({
  activeHotspot,
  detailsById,
  loading,
  messages,
  optimisticPower,
  pending,
  targetCandidates,
  toggleDevice,
}: HotspotGroupControlsProps) {
  return (
    <div className="home-cluster-modal__grid home-hotspot-control-modal__grid">
      {targetCandidates.map((candidate) => {
        const detail = detailsById.get(candidate.deviceId) ?? null;
        const powerIndex = detail?.control_schema.findIndex(isPowerControlSchema) ?? -1;
        const powerSchema =
          detail && powerIndex >= 0 ? detail.control_schema[powerIndex] : null;
        const stateValue =
          candidate.deviceId in optimisticPower
            ? optimisticPower[candidate.deviceId]
            : detailState(detail, candidate);
        const offline = detail?.is_offline ?? candidate.isOffline;
        const readonly = detail?.is_readonly_device ?? candidate.isReadonly;
        const active = isRuntimePowerOn(stateValue, offline);
        const pendingKey =
          detail && powerSchema && powerIndex >= 0
            ? `${detail.device_id}:${controlSchemaKey(powerSchema, powerIndex)}`
            : "";
        const disabled =
          loading ||
          offline ||
          readonly ||
          !detail ||
          !powerSchema ||
          Boolean(pending[pendingKey]);
        const message = messages[candidate.deviceId];

        return (
          <button
            aria-label={`${candidate.displayName} ${active ? "关闭" : "开启"}`}
            className={[
              "home-hotspot-control-modal__tile",
              active ? "is-active" : "",
              offline ? "is-offline" : "",
              disabled ? "is-disabled" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={disabled}
            key={candidate.deviceId}
            onClick={() => {
              if (detail) {
                void toggleDevice(candidate, detail);
              }
            }}
            type="button"
          >
            <span className="home-hotspot-control-modal__tile-icon" aria-hidden="true">
              <HotspotIcon
                deviceType={candidate.deviceType}
                iconAssetUrl={
                  candidate.deviceId === activeHotspot.deviceId
                    ? activeHotspot.iconAssetUrl
                    : null
                }
                iconType={
                  candidate.deviceId === activeHotspot.deviceId
                    ? activeHotspot.iconType
                    : candidate.deviceType
                }
                isOffline={offline}
                status={String(stateValue ?? "")}
              />
            </span>
            <span className="home-hotspot-control-modal__tile-copy">
              <strong>{detail?.display_name ?? candidate.displayName}</strong>
              <small>{detail?.room_name ?? candidate.roomName ?? "未分配房间"}</small>
            </span>
            <em>{message ?? formatPowerStateLabel(stateValue, offline)}</em>
          </button>
        );
      })}
    </div>
  );
}

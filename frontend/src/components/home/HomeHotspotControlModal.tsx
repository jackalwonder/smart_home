import { useEffect } from "react";
import { DeviceListItemDto } from "../../api/types";
import { HomeHotspotViewModel } from "../../view-models/home";
import { HotspotDetailControls } from "./HotspotDetailControls";
import { HotspotGroupControls } from "./HotspotGroupControls";
import { HotspotIcon } from "./HotspotIcon";
import { kindTitle, type HotspotControlMode } from "./homeHotspotControlModel";
import { useHomeHotspotControl } from "./useHomeHotspotControl";

interface HomeHotspotControlModalProps {
  devices: DeviceListItemDto[];
  hotspot: HomeHotspotViewModel | null;
  mode: HotspotControlMode;
  onClose: () => void;
  open: boolean;
}

export function HomeHotspotControlModal({
  devices,
  hotspot,
  mode,
  onClose,
  open,
}: HomeHotspotControlModalProps) {
  const control = useHomeHotspotControl({ devices, hotspot, mode, open });

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open || !hotspot || !control.primaryCandidate) {
    return null;
  }

  const activeHotspot = hotspot;

  return (
    <div
      aria-modal="true"
      className={[
        "home-cluster-modal",
        "home-hotspot-control-modal",
        mode === "detail" ? "is-detail" : "is-group",
      ].join(" ")}
      role="dialog"
    >
      <div
        aria-hidden="true"
        className="home-cluster-modal__backdrop"
        onClick={onClose}
      />
      <section
        className={[
          "home-cluster-modal__panel",
          "home-hotspot-control-modal__panel",
          `is-${control.anchorKind}`,
          mode === "detail" ? "is-detail" : "is-group",
        ].join(" ")}
      >
        <header className="home-cluster-modal__header home-hotspot-control-modal__header">
          <div className="home-cluster-modal__title-row">
            <span className="home-cluster-modal__glyph" aria-hidden="true">
              <HotspotIcon
                deviceType={activeHotspot.deviceType}
                iconAssetUrl={activeHotspot.iconAssetUrl}
                iconType={activeHotspot.iconType}
                isOffline={activeHotspot.isOffline}
                status={activeHotspot.status}
              />
            </span>
            <div>
              <span className="card-eyebrow">
                {mode === "detail" ? "设备详情" : "同房间控制"}
              </span>
              <h3>{kindTitle(control.anchorKind, mode)}</h3>
              <p>
                {mode === "detail"
                  ? control.primaryDetail?.display_name ??
                    control.primaryCandidate.displayName
                  : control.primaryCandidate.roomName ??
                    activeHotspot.deviceTypeLabel}
              </p>
            </div>
          </div>
          <div className="home-cluster-modal__header-meta">
            <span>
              {mode === "detail" ? "1 设备" : `${control.targetCandidates.length} 设备`}
            </span>
            <span>
              {mode === "detail"
                ? control.primaryCandidate.isOffline
                  ? "离线"
                  : "在线"
                : `${control.onlineCount} 在线`}
            </span>
            <span>
              {control.loading ? "读取中" : `${control.controllableCount} 可控`}
            </span>
          </div>
          <button
            aria-label="关闭弹窗"
            className="home-cluster-modal__close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        {control.error ? <p className="inline-error">{control.error}</p> : null}
        {mode === "detail" ? (
          <HotspotDetailControls
            activeHotspot={activeHotspot}
            loading={control.loading}
            messages={control.messages}
            pending={control.pending}
            primaryCandidate={control.primaryCandidate}
            primaryDetail={control.primaryDetail}
            setControlValue={control.setControlValue}
            submitSchema={control.submitSchema}
            values={control.values}
          />
        ) : (
          <HotspotGroupControls
            activeHotspot={activeHotspot}
            detailsById={control.detailsById}
            loading={control.loading}
            messages={control.messages}
            optimisticPower={control.optimisticPower}
            pending={control.pending}
            targetCandidates={control.targetCandidates}
            toggleDevice={control.toggleDevice}
          />
        )}
      </section>
    </div>
  );
}

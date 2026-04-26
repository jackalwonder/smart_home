import { BottomStatsStrip } from "../components/home/BottomStatsStrip";
import { ClimateDevicePicker } from "../components/home/ClimateDevicePicker";
import { HomeClusterControlModal } from "../components/home/HomeClusterControlModal";
import { HomeCommandStage } from "../components/home/HomeCommandStage";
import { HomeHotspotControlModal } from "../components/home/HomeHotspotControlModal";
import { HomeInsightRail } from "../components/home/HomeInsightRail";
import { HomeStageEditorWorkspace } from "../components/home/HomeStageEditorWorkspace";
import { useHomeDashboardController } from "../components/home/useHomeDashboardController";
import { PageFrame } from "../components/layout/PageFrame";

export function HomeDashboardPage() {
  const controller = useHomeDashboardController();

  if (controller.isHomeEditing) {
    return (
      <HomeStageEditorWorkspace
        devices={controller.devices}
        onApplied={controller.onAppliedHomeEdit}
        onExit={controller.closeHomeEditor}
        onOpenAdvancedSettings={controller.openAdvancedHomeSettings}
        stats={controller.viewModel.bottomStats}
      />
    );
  }

  return (
    <section className="page page--home">
      {controller.homeError ? <p className="inline-error">{controller.homeError}</p> : null}
      {controller.isHomeEditBlocked ? (
        <section className="panel home-page-edit-gate">
          <div>
            <span className="card-eyebrow">首页轻编辑</span>
            <strong>请先在设置页验证管理 PIN</strong>
            <p className="muted-copy">
              总览轻编辑只负责舞台和热点的即时调整。验证管理 PIN
              后，就可以直接回到总览页编辑首页。
            </p>
          </div>
          <div className="badge-row">
            <button
              className="button button--ghost"
              onClick={controller.closeHomeEditor}
              type="button"
            >
              先看总览
            </button>
            <button
              className="button button--primary"
              onClick={controller.openAdvancedHomeSettings}
              type="button"
            >
              去设置验证并继续
            </button>
          </div>
        </section>
      ) : null}
      <PageFrame
        aside={
          <HomeInsightRail
            devices={controller.devices}
            onOpenCluster={controller.handleOpenCluster}
            onOpenFavoriteDevice={controller.handleOpenFavoriteDevice}
            viewModel={controller.viewModel}
          />
        }
        className="page-frame--home"
        footer={<BottomStatsStrip stats={controller.viewModel.bottomStats} />}
      >
        <HomeCommandStage
          backgroundImageUrl={controller.viewModel.stage.backgroundImageUrl}
          backgroundImageSize={controller.viewModel.stage.backgroundImageSize}
          cacheMode={controller.viewModel.cacheMode}
          connectionStatus={controller.connectionStatus}
          events={controller.formattedEvents}
          hotspots={controller.viewModel.stage.hotspots}
          onActivateHotspot={(hotspot) => {
            void controller.handleActivateHotspot(hotspot);
          }}
          onLongPressHotspot={controller.handleOpenHotspotGroup}
          onSelectHotspot={(hotspotId) => {
            controller.setSelectedCluster(null);
            controller.setClimatePickerOpen(false);
            controller.setSelectedHotspotModal(null);
            controller.setSelectedHotspotId(hotspotId);
          }}
          pendingHotspotIds={controller.pendingHotspotIds}
          selectedHotspotId={controller.selectedHotspotId}
        />
      </PageFrame>

      <HomeClusterControlModal
        cluster={controller.selectedCluster}
        devices={controller.devices}
        onClose={() => controller.setSelectedCluster(null)}
        open={controller.selectedCluster !== null}
      />
      <ClimateDevicePicker
        devices={controller.climateDevices}
        onClose={() => controller.setClimatePickerOpen(false)}
        onSelectDevice={controller.openClimateDeviceDetail}
        open={controller.climatePickerOpen}
      />
      <HomeHotspotControlModal
        devices={controller.devices}
        hotspot={controller.selectedHotspotModal?.hotspot ?? null}
        mode={controller.selectedHotspotModal?.mode ?? "group"}
        onClose={() => controller.setSelectedHotspotModal(null)}
        open={controller.selectedHotspotModal !== null}
      />
    </section>
  );
}

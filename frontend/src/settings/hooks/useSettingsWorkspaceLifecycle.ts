import { useEffect } from "react";
import type { SessionModel } from "../../api/types";
import type { WsEvent } from "../../ws/types";
import type { SettingsSectionViewModel } from "../../view-models/settings";

interface UseSettingsWorkspaceLifecycleOptions {
  activeSection: SettingsSectionViewModel["key"];
  latestWsEvent: WsEvent | null;
  loadBackupDetails: () => Promise<void>;
  loadBackupRestoreAudits: () => Promise<void>;
  loadBackups: () => Promise<void>;
  loadDeliveryDetails: () => Promise<void>;
  loadEnergyState: () => Promise<void>;
  loadMediaCandidates: () => Promise<void>;
  loadMediaState: () => Promise<void>;
  loadSettings: () => Promise<void>;
  loadSgccLoginQrCode: (options?: { quiet?: boolean }) => Promise<void>;
  loadSystemConnection: () => Promise<void>;
  pinActive: boolean;
  session: { status: string; data: SessionModel | null };
  sgccLoginQrCodeImageUrl: string | null;
  sgccLoginQrCodeUpdatedAt?: string | null;
}

export function useSettingsWorkspaceLifecycle({
  activeSection,
  latestWsEvent,
  loadBackupDetails,
  loadBackupRestoreAudits,
  loadBackups,
  loadDeliveryDetails,
  loadEnergyState,
  loadMediaCandidates,
  loadMediaState,
  loadSettings,
  loadSgccLoginQrCode,
  loadSystemConnection,
  pinActive,
  session,
  sgccLoginQrCodeImageUrl,
  sgccLoginQrCodeUpdatedAt,
}: UseSettingsWorkspaceLifecycleOptions) {
  useEffect(() => {
    if (session.status !== "success") {
      return;
    }
    void loadSettings();
    void loadEnergyState();
    void loadMediaState();
  }, [session.data?.accessToken, session.status]);

  useEffect(() => {
    if (session.status !== "success") {
      return;
    }

    if (activeSection === "integrations") {
      void loadMediaCandidates();
      void loadSgccLoginQrCode();
      return;
    }

    if (activeSection === "overview") {
      void loadSgccLoginQrCode({ quiet: true });
      return;
    }

    if (activeSection === "terminal") {
      void loadDeliveryDetails();
    }
  }, [activeSection, pinActive, session.data?.accessToken, session.status]);

  useEffect(() => {
    if (
      session.status !== "success" ||
      (activeSection !== "integrations" && activeSection !== "overview")
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadSgccLoginQrCode({ quiet: true });
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    activeSection,
    session.data?.accessToken,
    session.status,
    sgccLoginQrCodeImageUrl,
    sgccLoginQrCodeUpdatedAt,
  ]);

  useEffect(() => {
    if (session.status !== "success") {
      return;
    }
    void loadBackupDetails();
  }, [pinActive, session.data?.accessToken, session.status]);

  useEffect(() => {
    if (!latestWsEvent) {
      return;
    }

    switch (latestWsEvent.event_type) {
      case "backup_restore_completed":
        void Promise.all([
          loadSettings(),
          loadSystemConnection(),
          loadEnergyState(),
          loadMediaState(),
          loadBackups(),
          loadBackupRestoreAudits(),
        ]);
        break;
      case "energy_refresh_completed":
      case "energy_refresh_failed":
        void Promise.all([loadEnergyState(), loadSettings()]);
        break;
      case "ha_sync_degraded":
      case "ha_sync_recovered":
        void loadSystemConnection();
        break;
      case "media_state_changed":
        void Promise.all([loadMediaState(), loadSettings()]);
        break;
      case "settings_updated":
        void loadSettings();
        break;
      default:
        break;
    }
  }, [latestWsEvent]);
}

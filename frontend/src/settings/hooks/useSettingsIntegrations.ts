import { useDefaultMediaSettings } from "./useDefaultMediaSettings";
import { useEnergyIntegrationSettings } from "./useEnergyIntegrationSettings";
import { useHaIntegrationSettings } from "./useHaIntegrationSettings";

interface UseSettingsIntegrationsOptions {
  canEdit: boolean;
  onSettingsReload: () => Promise<void>;
}

export function useSettingsIntegrations(options: UseSettingsIntegrationsOptions) {
  const haIntegration = useHaIntegrationSettings(options);
  const energyIntegration = useEnergyIntegrationSettings(options);
  const mediaIntegration = useDefaultMediaSettings(options);

  return {
    ...energyIntegration,
    ...mediaIntegration,
    ...haIntegration,
  };
}

import { useSettingsDraft } from "./useSettingsDraft";
import type { SettingsDto } from "../../api/types";

interface UseSettingsHomeDraftPropsOptions {
  onSaved: () => Promise<void>;
  settingsData: SettingsDto | null;
  setShowAdvancedEditor: (updater: (current: boolean) => boolean) => void;
  showAdvancedEditor: boolean;
  terminalId?: string | null;
}

export function useSettingsHomeDraftProps({
  onSaved,
  settingsData,
  setShowAdvancedEditor,
  showAdvancedEditor,
  terminalId,
}: UseSettingsHomeDraftPropsOptions) {
  const draft = useSettingsDraft({
    onSaved,
    settingsData,
    terminalId,
  });
  const selectedFavoriteCount = draft.settingsDraft.favorites.filter(
    (favorite) => favorite.selected,
  ).length;

  return {
    applySettingsDraftFromData: draft.applySettingsDraftFromData,
    handleSave: draft.handleSave,
    isSaving: draft.isSaving,
    saveMessage: draft.saveMessage,
    selectedFavoriteCount,
    homeProps: {
      addFavoriteDraft: draft.addFavoriteDraft,
      addPolicyDraft: draft.addPolicyDraft,
      removeFavoriteDraft: draft.removeFavoriteDraft,
      removePolicyDraft: draft.removePolicyDraft,
      saveMessage: draft.saveMessage,
      selectedFavoriteCount,
      setShowAdvancedEditor,
      settingsDraft: draft.settingsDraft,
      showAdvancedEditor,
      updateFavoriteDraft: draft.updateFavoriteDraft,
      updateFunctionDraft: draft.updateFunctionDraft,
      updatePageDraft: draft.updatePageDraft,
      updatePolicyDraft: draft.updatePolicyDraft,
      upsertPolicyDraft: draft.upsertPolicyDraft,
    },
  };
}

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { normalizeSettingsSectionKey } from "../../components/settings/SettingsOperationsWorkflow";
import type { SettingsSectionViewModel } from "../../view-models/settings";

interface UseSettingsWorkspaceNavigationOptions {
  resetBackupDetails: () => void;
  resetDeliveryDetails: () => void;
}

export function useSettingsWorkspaceNavigation({
  resetBackupDetails,
  resetDeliveryDetails,
}: UseSettingsWorkspaceNavigationOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const normalizedRequestedSection = normalizeSettingsSectionKey(requestedSection);
  const [activeSection, setActiveSection] = useState<SettingsSectionViewModel["key"]>(
    normalizedRequestedSection,
  );
  const [showPinManager, setShowPinManager] = useState(false);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false);
  const [pendingScrollTargetId, setPendingScrollTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (requestedSection && requestedSection !== normalizedRequestedSection) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("section", normalizedRequestedSection);
      setSearchParams(nextParams, { replace: true });
    }

    if (normalizedRequestedSection !== activeSection) {
      setActiveSection(normalizedRequestedSection);
    }
  }, [
    activeSection,
    normalizedRequestedSection,
    requestedSection,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    setShowPinManager(false);
    if (activeSection !== "home") {
      setShowAdvancedEditor(false);
    }
    if (activeSection !== "terminal") {
      resetDeliveryDetails();
    }
    if (activeSection !== "backup") {
      resetBackupDetails();
    }
  }, [activeSection, resetBackupDetails, resetDeliveryDetails]);

  useEffect(() => {
    if (!pendingScrollTargetId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      document
        .getElementById(pendingScrollTargetId)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
      setPendingScrollTargetId(null);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeSection, pendingScrollTargetId]);

  function handleSelectSection(
    nextSection: SettingsSectionViewModel["key"],
    targetId?: string,
  ) {
    setActiveSection(nextSection);
    setPendingScrollTargetId(targetId ?? null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("section", nextSection);
    setSearchParams(nextParams, { replace: true });
  }

  return {
    activeSection,
    handleSelectSection,
    setShowAdvancedEditor,
    showAdvancedEditor,
    showPinManager,
    togglePinManager: () => setShowPinManager((current) => !current),
  };
}

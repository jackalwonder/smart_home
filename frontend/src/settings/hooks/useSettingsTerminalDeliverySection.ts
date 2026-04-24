import { useCallback, useMemo, useState } from "react";
import { useTerminalDelivery } from "./useTerminalDelivery";

interface UseSettingsTerminalDeliverySectionOptions {
  canEdit: boolean;
  currentTerminalId?: string | null;
  operationsGuideOpen: boolean;
}

export function useSettingsTerminalDeliverySection({
  canEdit,
  currentTerminalId,
  operationsGuideOpen,
}: UseSettingsTerminalDeliverySectionOptions) {
  const delivery = useTerminalDelivery({ canEdit, currentTerminalId });
  const [showDetails, setShowDetails] = useState(false);

  const selectedTerminal = delivery.selectedTerminal;
  const tokenState = selectedTerminal;

  const toggleDetails = useCallback(() => {
    setShowDetails((current) => !current);
  }, []);

  const resetDetails = useCallback(() => {
    setShowDetails(false);
  }, []);

  const loadDetails = useCallback(async () => {
    await Promise.all([delivery.loadDirectory(), delivery.loadAudits()]);
  }, [delivery.loadAudits, delivery.loadDirectory]);

  const summaryRows = useMemo(
    () => [
      { label: "终端目录", value: `${delivery.directory.length} 台` },
      {
        label: "目标终端",
        value:
          selectedTerminal?.terminal_name ??
          selectedTerminal?.terminal_code ??
          "-",
      },
      {
        label: "详情面板",
        value: showDetails ? "已展开" : "已收起",
      },
    ],
    [delivery.directory.length, selectedTerminal, showDetails],
  );

  const compactOverviewRows = useMemo(
    () => [
      { label: "终端目录", value: `${delivery.directory.length} 台` },
      {
        label: "目标终端",
        value:
          selectedTerminal?.terminal_name ??
          selectedTerminal?.terminal_code ??
          "-",
      },
      {
        label: "激活凭据",
        value: tokenState?.token_configured ? "已就绪" : "待生成",
      },
      { label: "流程说明", value: operationsGuideOpen ? "已展开" : "已收起" },
    ],
    [delivery.directory.length, operationsGuideOpen, selectedTerminal, tokenState],
  );

  return {
    ...delivery,
    compactOverviewRows,
    loadDetails,
    resetDetails,
    showDetails,
    summaryRows,
    toggleDetails,
    tokenState,
  };
}

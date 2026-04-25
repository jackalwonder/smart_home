import { useCallback, useMemo, useState } from "react";
import {
  buildBootstrapActivationCode,
  buildBootstrapActivationLink,
} from "../../auth/bootstrapToken";
import { normalizeApiError } from "../../api/httpClient";
import {
  createOrResetTerminalBootstrapToken,
  fetchTerminalBootstrapTokenAudits,
  fetchTerminalBootstrapTokenDirectory,
} from "../../api/terminalBootstrapTokensApi";
import { claimTerminalPairingCode } from "../../api/terminalPairingCodesApi";
import type {
  TerminalBootstrapTokenAuditItemDto,
  TerminalBootstrapTokenCreateDto,
  TerminalBootstrapTokenDirectoryItemDto,
} from "../../api/types";

interface FeedbackState {
  tone: "success" | "error";
  text: string;
}

interface UseTerminalDeliveryOptions {
  canEdit: boolean;
  currentTerminalId?: string | null;
}

export function useTerminalDelivery({
  canEdit,
  currentTerminalId,
}: UseTerminalDeliveryOptions) {
  const [directory, setDirectory] = useState<TerminalBootstrapTokenDirectoryItemDto[]>([]);
  const [selectedTerminalId, setSelectedTerminalIdState] = useState("");
  const [reveal, setReveal] = useState<TerminalBootstrapTokenCreateDto | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [loading, setLoading] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [audits, setAudits] = useState<TerminalBootstrapTokenAuditItemDto[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingClaimBusy, setPairingClaimBusy] = useState(false);
  const [pairingClaimFeedback, setPairingClaimFeedback] = useState<FeedbackState | null>(null);

  const selectedTerminal = useMemo(
    () => directory.find((item) => item.terminal_id === selectedTerminalId) ?? null,
    [directory, selectedTerminalId],
  );
  const activationLink = reveal ? buildBootstrapActivationLink(reveal.bootstrap_token) : null;
  const activationCode = reveal ? buildBootstrapActivationCode(reveal.bootstrap_token) : null;

  const chooseDefaultTerminalId = useCallback(
    (items: TerminalBootstrapTokenDirectoryItemDto[], current: string) => {
      if (current && items.some((item) => item.terminal_id === current)) {
        return current;
      }
      if (currentTerminalId && items.some((item) => item.terminal_id === currentTerminalId)) {
        return currentTerminalId;
      }
      return items[0]?.terminal_id ?? "";
    },
    [currentTerminalId],
  );

  const setSelectedTerminalId = useCallback((value: string) => {
    setSelectedTerminalIdState(value);
    setReveal(null);
  }, []);

  const applyDirectoryItems = useCallback(
    (items: TerminalBootstrapTokenDirectoryItemDto[]) => {
      setDirectory(items);
      setSelectedTerminalIdState((current) => chooseDefaultTerminalId(items, current));
    },
    [chooseDefaultTerminalId],
  );

  const loadDirectory = useCallback(async () => {
    if (!canEdit) {
      setDirectory([]);
      setSelectedTerminalIdState("");
      return;
    }

    setLoading(true);
    try {
      const response = await fetchTerminalBootstrapTokenDirectory();
      applyDirectoryItems(response.items);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: normalizeApiError(error).message,
      });
    } finally {
      setLoading(false);
    }
  }, [applyDirectoryItems, canEdit]);

  const loadAudits = useCallback(async () => {
    if (!canEdit) {
      setAudits([]);
      return;
    }

    setAuditLoading(true);
    try {
      const response = await fetchTerminalBootstrapTokenAudits();
      setAudits(response.items);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: normalizeApiError(error).message,
      });
    } finally {
      setAuditLoading(false);
    }
  }, [canEdit]);

  const loadInitialDirectory = useCallback(async () => {
    if (!canEdit) {
      applyDirectoryItems([]);
      return;
    }

    const response = await fetchTerminalBootstrapTokenDirectory();
    applyDirectoryItems(response.items);
  }, [applyDirectoryItems, canEdit]);

  const createOrReset = useCallback(async () => {
    if (!canEdit) {
      setFeedback({
        tone: "error",
        text: "创建终端激活令牌前，请先验证管理 PIN。",
      });
      return;
    }
    if (!selectedTerminalId) {
      setFeedback({
        tone: "error",
        text: "当前终端会话还未就绪，请稍后重试。",
      });
      return;
    }

    setFeedback(null);
    setCreateBusy(true);
    try {
      const response = await createOrResetTerminalBootstrapToken(selectedTerminalId);
      setReveal(response);
      setFeedback({
        tone: "success",
        text: response.rotated
          ? "激活凭据已重置，旧凭据已立即失效。"
          : "激活凭据已生成，可用于新终端激活。",
      });
      await Promise.all([loadDirectory(), loadAudits()]);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: normalizeApiError(error).message,
      });
    } finally {
      setCreateBusy(false);
    }
  }, [canEdit, loadAudits, loadDirectory, selectedTerminalId]);

  const claimPairingCode = useCallback(async () => {
    if (!canEdit) {
      setPairingClaimFeedback({
        tone: "error",
        text: "认领绑定码前，请先验证管理 PIN。",
      });
      return;
    }
    if (!pairingCode.trim()) {
      setPairingClaimFeedback({
        tone: "error",
        text: "请先输入终端屏幕上的绑定码。",
      });
      return;
    }

    setPairingClaimFeedback(null);
    setPairingClaimBusy(true);
    try {
      const response = await claimTerminalPairingCode(pairingCode.trim());
      setPairingCode("");
      setSelectedTerminalIdState(response.terminal_id);
      setReveal(null);
      setPairingClaimFeedback({
        tone: "success",
        text: `${response.terminal_name} (${response.terminal_code}) 已认领，终端将自动完成激活。`,
      });
      await Promise.all([loadDirectory(), loadAudits()]);
    } catch (error) {
      setPairingClaimFeedback({
        tone: "error",
        text: normalizeApiError(error).message,
      });
    } finally {
      setPairingClaimBusy(false);
    }
  }, [canEdit, loadAudits, loadDirectory, pairingCode]);

  const copyToken = useCallback(async () => {
    if (!reveal?.bootstrap_token) {
      return;
    }
    try {
      await navigator.clipboard.writeText(reveal.bootstrap_token);
      setFeedback({
        tone: "success",
        text: "原始激活凭据已复制到剪贴板。",
      });
    } catch {
      setFeedback({
        tone: "error",
        text: "复制失败，请手动复制当前展示的原始激活凭据。",
      });
    }
  }, [reveal?.bootstrap_token]);

  const copyActivationLink = useCallback(async () => {
    if (!activationLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(activationLink);
      setFeedback({
        tone: "success",
        text: "激活链接已复制到剪贴板。",
      });
    } catch {
      setFeedback({
        tone: "error",
        text: "复制激活链接失败，请稍后重试。",
      });
    }
  }, [activationLink]);

  const copyActivationCode = useCallback(async () => {
    if (!activationCode) {
      return;
    }
    try {
      await navigator.clipboard.writeText(activationCode);
      setFeedback({
        tone: "success",
        text: "激活码已复制到剪贴板。",
      });
    } catch {
      setFeedback({
        tone: "error",
        text: "复制激活码失败，请稍后重试。",
      });
    }
  }, [activationCode]);

  return {
    activationCode,
    activationLink,
    auditLoading,
    audits,
    copyActivationCode,
    copyActivationLink,
    copyToken,
    createBusy,
    createOrReset,
    directory,
    feedback,
    loadAudits,
    loadDirectory,
    loadInitialDirectory,
    loading,
    pairingClaimBusy,
    pairingClaimFeedback,
    pairingCode,
    claimPairingCode,
    reveal,
    selectedTerminal,
    selectedTerminalId,
    setPairingCode,
    setSelectedTerminalId,
  };
}

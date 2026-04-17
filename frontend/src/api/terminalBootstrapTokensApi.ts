import { apiRequest } from "./httpClient";
import {
  TerminalBootstrapTokenAuditListDto,
  TerminalBootstrapTokenCreateDto,
  TerminalBootstrapTokenDirectoryDto,
  TerminalBootstrapTokenStatusDto,
} from "./types";

export function fetchTerminalBootstrapTokenDirectory() {
  return apiRequest<TerminalBootstrapTokenDirectoryDto>("/api/v1/terminals/bootstrap-tokens");
}

export function fetchTerminalBootstrapTokenAudits(limit = 20) {
  return apiRequest<TerminalBootstrapTokenAuditListDto>(
    `/api/v1/terminals/bootstrap-token-audits?limit=${limit}`,
  );
}

export function fetchTerminalBootstrapTokenStatus(terminalId: string) {
  return apiRequest<TerminalBootstrapTokenStatusDto>(
    `/api/v1/terminals/${encodeURIComponent(terminalId)}/bootstrap-token`,
  );
}

export function createOrResetTerminalBootstrapToken(terminalId: string) {
  return apiRequest<TerminalBootstrapTokenCreateDto>(
    `/api/v1/terminals/${encodeURIComponent(terminalId)}/bootstrap-token`,
    {
      method: "POST",
    },
  );
}

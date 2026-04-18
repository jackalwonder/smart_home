import { apiRequest } from "./httpClient";
import {
  TerminalPairingClaimDto,
  TerminalPairingIssueDto,
  TerminalPairingPollDto,
} from "./types";

export function issueTerminalPairingCode(terminalId: string) {
  return apiRequest<TerminalPairingIssueDto>(
    `/api/v1/terminals/${encodeURIComponent(terminalId)}/pairing-code-sessions`,
    {
      method: "POST",
      useAccessToken: false,
    },
  );
}

export function pollTerminalPairingCode(terminalId: string, pairingId: string) {
  return apiRequest<TerminalPairingPollDto>(
    `/api/v1/terminals/${encodeURIComponent(terminalId)}/pairing-code-sessions/${encodeURIComponent(pairingId)}`,
    {
      useAccessToken: false,
    },
  );
}

export function claimTerminalPairingCode(pairingCode: string) {
  return apiRequest<TerminalPairingClaimDto>("/api/v1/terminals/pairing-code-claims", {
    method: "POST",
    body: JSON.stringify({ pairing_code: pairingCode }),
  });
}

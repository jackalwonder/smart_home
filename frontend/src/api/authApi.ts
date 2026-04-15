import { apiRequest } from "./httpClient";
import { PinSessionDto, PinVerifyDto, PinVerifyInput, SessionDto, SessionModel } from "./types";

export async function fetchCurrentSession(): Promise<SessionModel> {
  const dto = await apiRequest<SessionDto>("/api/v1/auth/session");

  return {
    homeId: dto.home_id,
    operatorId: dto.operator_id,
    terminalId: dto.terminal_id,
    loginMode: dto.login_mode,
    terminalMode: dto.terminal_mode,
    pinSessionActive: dto.pin_session_active,
    pinSessionExpiresAt: dto.pin_session_expires_at,
    features: dto.features,
  };
}

export function fetchPinSessionStatus() {
  return apiRequest<PinSessionDto>("/api/v1/auth/pin/session");
}

export function verifyManagementPin(input: PinVerifyInput) {
  return apiRequest<PinVerifyDto>("/api/v1/auth/pin/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

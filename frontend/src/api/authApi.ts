import { apiRequest } from "./httpClient";
import {
  ApiError,
  PinSessionDto,
  PinVerifyDto,
  PinVerifyInput,
  SessionDto,
  SessionModel,
} from "./types";
import { setAccessToken } from "../auth/accessToken";
import { getBootstrapToken } from "../auth/bootstrapToken";

export class BootstrapTokenActivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapTokenActivationError";
  }
}

export function isBootstrapTokenActivationError(error: unknown) {
  return error instanceof BootstrapTokenActivationError;
}

export async function fetchCurrentSession(): Promise<SessionModel> {
  const bootstrapToken = getBootstrapToken();
  if (!bootstrapToken) {
    throw new BootstrapTokenActivationError("请先激活终端。");
  }
  const dto = await exchangeBootstrapToken(bootstrapToken);
  return mapSession(dto);
}

export async function activateSessionWithBootstrapToken(bootstrapToken: string): Promise<SessionModel> {
  const dto = await exchangeBootstrapToken(bootstrapToken);
  return mapSession(dto);
}

async function exchangeBootstrapToken(bootstrapToken: string) {
  try {
    return await apiRequest<SessionDto>("/api/v1/auth/session/bootstrap", {
      method: "POST",
      headers: {
        Authorization: `Bootstrap ${bootstrapToken}`,
      },
      useAccessToken: false,
    });
  } catch (error) {
    if (error instanceof ApiError && error.payload.code === "UNAUTHORIZED") {
      throw new BootstrapTokenActivationError("Bootstrap token 已失效，请重新激活终端。");
    }
    throw error;
  }
}

function mapSession(dto: SessionDto): SessionModel {
  setAccessToken(dto.access_token);

  return {
    homeId: dto.home_id,
    operatorId: dto.operator_id,
    terminalId: dto.terminal_id,
    loginMode: dto.login_mode,
    terminalMode: dto.terminal_mode,
    accessToken: dto.access_token,
    accessTokenExpiresAt: dto.access_token_expires_at,
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

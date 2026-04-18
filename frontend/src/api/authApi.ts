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
  reason:
    | "missing"
    | "expired"
    | "invalid"
    | "network"
    | "server"
    | "malformed";

  constructor(
    message: string,
    reason:
      | "missing"
      | "expired"
      | "invalid"
      | "network"
      | "server"
      | "malformed" = "invalid",
  ) {
    super(message);
    this.name = "BootstrapTokenActivationError";
    this.reason = reason;
  }
}

export function isBootstrapTokenActivationError(error: unknown) {
  return error instanceof BootstrapTokenActivationError;
}

export async function fetchCurrentSession(): Promise<SessionModel> {
  const bootstrapToken = getBootstrapToken();
  if (!bootstrapToken) {
    throw new BootstrapTokenActivationError("请先激活终端。", "missing");
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
    if (error instanceof ApiError) {
      if (error.payload.code === "UNAUTHORIZED") {
        const message = error.payload.message.toLowerCase();
        if (message.includes("expired")) {
          throw new BootstrapTokenActivationError("激活信息已过期，请在管理端重新创建。", "expired");
        }
        throw new BootstrapTokenActivationError(
          "激活信息无效，可能已被重置、复制不完整，或不属于这台终端。",
          "invalid",
        );
      }
      throw new BootstrapTokenActivationError(
        `终端激活失败：${error.payload.message}`,
        "server",
      );
    }
    if (error instanceof TypeError) {
      throw new BootstrapTokenActivationError(
        "当前无法连接服务端，请检查网络或稍后再试。",
        "network",
      );
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

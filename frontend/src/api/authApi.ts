import { setAccessToken } from "../auth/accessToken";
import { getBootstrapToken } from "../auth/bootstrapToken";
import { isDevActivationBypassEnabled } from "../config/devActivationBypass";
import { getRequestContext } from "../config/requestContext";
import { apiRequest } from "./httpClient";
import {
  ApiError,
  PinSessionDto,
  PinVerifyDto,
  PinVerifyInput,
  SessionDto,
  SessionModel,
} from "./types";

export class BootstrapTokenActivationError extends Error {
  reason: "missing" | "expired" | "invalid" | "network" | "server" | "malformed";

  constructor(
    message: string,
    reason: "missing" | "expired" | "invalid" | "network" | "server" | "malformed" = "invalid",
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
  if (isDevActivationBypassEnabled()) {
    const dto = await fetchDevSession();
    return mapSession(dto);
  }

  const bootstrapToken = getBootstrapToken();
  if (!bootstrapToken) {
    throw new BootstrapTokenActivationError("请先完成终端激活。", "missing");
  }
  const dto = await exchangeBootstrapToken(bootstrapToken);
  return mapSession(dto);
}

export async function activateSessionWithBootstrapToken(
  bootstrapToken: string,
): Promise<SessionModel> {
  const dto = await exchangeBootstrapToken(bootstrapToken);
  return mapSession(dto);
}

async function fetchDevSession() {
  const context = getRequestContext();
  return apiRequest<SessionDto>("/api/v1/auth/session/dev", {
    headers: {
      "x-home-id": context.homeId,
      "x-terminal-id": context.terminalId,
    },
    method: "POST",
    useAccessToken: false,
  });
}

async function exchangeBootstrapToken(bootstrapToken: string) {
  try {
    return await apiRequest<SessionDto>("/api/v1/auth/session/bootstrap", {
      headers: {
        Authorization: `Bootstrap ${bootstrapToken}`,
      },
      method: "POST",
      useAccessToken: false,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.payload.code === "UNAUTHORIZED") {
        const message = error.payload.message.toLowerCase();
        if (message.includes("expired")) {
          throw new BootstrapTokenActivationError(
            "激活信息已经过期，请在管理端重新签发。",
            "expired",
          );
        }
        throw new BootstrapTokenActivationError(
          "激活信息无效，可能已经被重置、内容不完整，或不属于这台终端。",
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
        "当前无法连接服务端，请检查网络或稍后重试。",
        "network",
      );
    }
    throw error;
  }
}

function mapSession(dto: SessionDto): SessionModel {
  setAccessToken(dto.access_token);

  return {
    accessToken: dto.access_token,
    accessTokenExpiresAt: dto.access_token_expires_at,
    features: dto.features,
    homeId: dto.home_id,
    loginMode: dto.login_mode,
    operatorId: dto.operator_id,
    pinSessionActive: dto.pin_session_active,
    pinSessionExpiresAt: dto.pin_session_expires_at,
    terminalId: dto.terminal_id,
    terminalMode: dto.terminal_mode,
  };
}

export function fetchPinSessionStatus() {
  return apiRequest<PinSessionDto>("/api/v1/auth/pin/session");
}

export function verifyManagementPin(input: PinVerifyInput) {
  return apiRequest<PinVerifyDto>("/api/v1/auth/pin/verify", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

import { ApiEnvelope, ApiError, ApiErrorPayload } from "./types";
import { getRequestContext } from "../config/requestContext";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || "";

const API_BASE_URL =
  configuredBaseUrl ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:8000");

export async function apiRequest<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const url = new URL(`${API_BASE_URL}${input}`);
  const { homeId, terminalId } = getRequestContext();
  if (!url.searchParams.has("home_id")) {
    url.searchParams.set("home_id", homeId);
  }
  if (!url.searchParams.has("terminal_id")) {
    url.searchParams.set("terminal_id", terminalId);
  }

  const response = await fetch(url.toString(), {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-home-id": homeId,
      "x-terminal-id": terminalId,
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError({
      code: "BAD_RESPONSE",
      message: "服务端未返回可解析的 JSON 响应",
    });
  }

  if (!response.ok || !envelope.success || !envelope.data) {
    throw new ApiError(
      envelope.error ?? {
        code: "REQUEST_FAILED",
        message: "请求失败",
      },
    );
  }

  return envelope.data;
}

export function normalizeApiError(error: unknown): ApiErrorPayload {
  if (error instanceof ApiError) {
    return error.payload;
  }

  return {
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "未知异常",
  };
}

export { API_BASE_URL };

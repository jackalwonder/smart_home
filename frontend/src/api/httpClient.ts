import { getAccessToken } from "../auth/accessToken";
import { ApiEnvelope, ApiError, ApiErrorPayload } from "./types";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || "";

const API_BASE_URL =
  configuredBaseUrl ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:8000");

interface ApiRequestOptions extends RequestInit {
  useAccessToken?: boolean;
}

export async function apiRequest<T>(input: string, init?: ApiRequestOptions): Promise<T> {
  const url = new URL(`${API_BASE_URL}${input}`);
  const accessToken = getAccessToken();
  const useAccessToken = init?.useAccessToken ?? true;

  const headers = new Headers(init?.headers ?? undefined);
  const body = init?.body;
  const hasFormDataBody = typeof FormData !== "undefined" && body instanceof FormData;
  if (!headers.has("Content-Type") && !hasFormDataBody) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken && useAccessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(url.toString(), {
    credentials: "include",
    ...init,
    headers,
  });

  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    if ([502, 503, 504].includes(response.status)) {
      throw new ApiError({
        code: "UPSTREAM_TIMEOUT",
        message: "服务端网关等待超时，能耗同步可能仍在后台执行，请稍后刷新状态。",
      });
    }

    throw new ApiError({
      code: "BAD_RESPONSE",
      message: "服务端没有返回可解析的 JSON 响应。",
    });
  }

  if (!response.ok || !envelope.success || !envelope.data) {
    throw new ApiError(
      envelope.error ?? {
        code: "REQUEST_FAILED",
        message: "请求失败。",
      },
    );
  }

  return envelope.data;
}

export function normalizeApiError(error: unknown): ApiErrorPayload {
  if (error instanceof ApiError) {
    return error.payload;
  }

  if (error instanceof TypeError) {
    return {
      code: "NETWORK_ERROR",
      message: "网络连接失败，请检查本机网络或稍后重试。",
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "未知异常",
  };
}

export { API_BASE_URL };

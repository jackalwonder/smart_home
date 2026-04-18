const BOOTSTRAP_TOKEN_STORAGE_KEY = "smart_home.bootstrap_token";
const BOOTSTRAP_TOKEN_QUERY_PARAM = "bootstrap_token";
const BOOTSTRAP_ACTIVATION_CODE_PREFIX = "smart-home-activate:";

function configuredBootstrapToken() {
  return import.meta.env.VITE_BOOTSTRAP_TOKEN?.trim() || null;
}

function readStoredBootstrapToken() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(BOOTSTRAP_TOKEN_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function getBootstrapToken() {
  return readStoredBootstrapToken() || configuredBootstrapToken();
}

export function setBootstrapToken(token: string | null | undefined) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const normalized = token?.trim();
    if (normalized) {
      window.localStorage.setItem(BOOTSTRAP_TOKEN_STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(BOOTSTRAP_TOKEN_STORAGE_KEY);
    }
  } catch {
    return;
  }
}

export function buildBootstrapActivationLink(token: string, baseUrl?: string) {
  const normalized = token.trim();
  if (!normalized) {
    return null;
  }
  const source =
    baseUrl?.trim() ||
    (typeof window !== "undefined" ? window.location.href : null);
  if (!source) {
    return null;
  }
  const url = new URL(source);
  url.searchParams.set(BOOTSTRAP_TOKEN_QUERY_PARAM, normalized);
  return url.toString();
}

export function buildBootstrapActivationCode(token: string) {
  const normalized = token.trim();
  if (!normalized) {
    return null;
  }
  return `${BOOTSTRAP_ACTIVATION_CODE_PREFIX}${normalized}`;
}

export function resolveBootstrapActivationInput(input: string) {
  const normalized = input.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith(BOOTSTRAP_ACTIVATION_CODE_PREFIX)) {
    const token = normalized.slice(BOOTSTRAP_ACTIVATION_CODE_PREFIX.length).trim();
    return token || null;
  }

  const tokenFromUrl = readBootstrapTokenFromUrlLike(normalized);
  if (tokenFromUrl) {
    return tokenFromUrl;
  }

  return normalized;
}

export function consumeBootstrapTokenFromUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  const token = url.searchParams.get(BOOTSTRAP_TOKEN_QUERY_PARAM)?.trim() || null;
  if (!token) {
    return null;
  }

  url.searchParams.delete(BOOTSTRAP_TOKEN_QUERY_PARAM);
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  return token;
}

function readBootstrapTokenFromUrlLike(value: string) {
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(value, base);
    return url.searchParams.get(BOOTSTRAP_TOKEN_QUERY_PARAM)?.trim() || null;
  } catch {
    return null;
  }
}

export {
  BOOTSTRAP_ACTIVATION_CODE_PREFIX,
  BOOTSTRAP_TOKEN_QUERY_PARAM,
  BOOTSTRAP_TOKEN_STORAGE_KEY,
};

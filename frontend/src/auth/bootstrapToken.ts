const BOOTSTRAP_TOKEN_STORAGE_KEY = "smart_home.bootstrap_token";

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

export { BOOTSTRAP_TOKEN_STORAGE_KEY };

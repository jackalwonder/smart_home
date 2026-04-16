let currentAccessToken: string | null = null;

export function setAccessToken(token: string | null | undefined) {
  currentAccessToken = token?.trim() || null;
}

export function getAccessToken() {
  return currentAccessToken;
}

export function clearAccessToken() {
  currentAccessToken = null;
}

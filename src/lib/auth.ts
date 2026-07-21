const ACCESS_TOKEN_KEY = "smc_access_token";
const REFRESH_TOKEN_KEY = "smc_refresh_token";

export function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getAuthHeader(): string | null {
  const token = getAccessToken();
  return token ? `Bearer ${token}` : null;
}

export function clearCredentials(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function hasCredentials(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(getAccessToken());
}

// WordPress compatibility shims for routes still using old auth model
// These will be removed once all routes are migrated to JWT
export function hasWordPressNonce(): boolean {
  // WordPress nonce is no longer used; defer to JWT credentials
  return hasCredentials();
}

export function getWordPressNonce(): string | null {
  // WordPress nonce is no longer used; return null
  return null;
}

export function hasBackendNonce(): boolean {
  // Backend nonce is no longer used; defer to JWT credentials
  return hasCredentials();
}

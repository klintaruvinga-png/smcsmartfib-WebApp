/**
 * Isomorphic auth helpers.
 *
 * Browser-only APIs (sessionStorage, window) are guarded so this module can
 * be imported in Node.js test environments without errors.
 */

const SESSION_KEY = "smc_wp_auth";

export function encodeBasicCredentials(username: string, appPassword: string): string {
  const raw = `${username}:${appPassword}`;
  if (typeof btoa !== "undefined") return btoa(raw);
  // Node.js fallback
  return Buffer.from(raw).toString("base64");
}

/** Persist WordPress application-password credentials in sessionStorage. */
export function setCredentials(username: string, appPassword: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, encodeBasicCredentials(username, appPassword));
}

/** Return the `Authorization: Basic …` header value, or null if not stored. */
export function getAuthHeader(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const v = sessionStorage.getItem(SESSION_KEY);
  return v ? `Basic ${v}` : null;
}

/** Remove stored credentials from sessionStorage. */
export function clearCredentials(): void {
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
}

/** True if credentials are currently stored in sessionStorage. */
export function hasCredentials(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return Boolean(sessionStorage.getItem(SESSION_KEY));
}

/**
 * Read the WordPress REST nonce injected by the server via:
 *   window.SNIPER.nonce  or  window.wpApiSettings.nonce
 */
export function getWordPressNonce(): string | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SNIPER?: { nonce?: string };
    wpApiSettings?: { nonce?: string };
  };
  return w.SNIPER?.nonce ?? w.wpApiSettings?.nonce ?? null;
}

/** True if a WordPress nonce is available on the page. */
export function hasWordPressNonce(): boolean {
  return Boolean(getWordPressNonce());
}

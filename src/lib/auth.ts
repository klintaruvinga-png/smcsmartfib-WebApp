const KEY = "smc_wp_auth";

export function setCredentials(username: string, appPassword: string): void {
  sessionStorage.setItem(KEY, btoa(`${username}:${appPassword}`));
}

export function getAuthHeader(): string | null {
  if (typeof window === "undefined") return null;
  const v = sessionStorage.getItem(KEY);
  return v ? `Basic ${v}` : null;
}

export function clearCredentials(): void {
  if (typeof window !== "undefined") sessionStorage.removeItem(KEY);
}

export function hasCredentials(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(sessionStorage.getItem(KEY));
}

export function hasWordPressNonce(): boolean {
  if (typeof window === "undefined") return false;
  const wpWindow = window as Window & { SNIPER?: { nonce?: string } };
  return Boolean(wpWindow.SNIPER?.nonce);
}

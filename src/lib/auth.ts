const KEY = "smc_wp_auth";

type WordPressWindow = Window & {
  SNIPER?: { nonce?: string };
  wpApiSettings?: { nonce?: string };
};

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
  return Boolean(getWordPressNonce());
}

export function getWordPressNonce(): string | null {
  if (typeof window === "undefined") return null;
  const wpWindow = window as WordPressWindow;
  return wpWindow.SNIPER?.nonce ?? wpWindow.wpApiSettings?.nonce ?? null;
}

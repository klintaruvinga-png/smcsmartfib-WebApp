const KEY = " smc_auth\;

export function setCredentials(username: string, appPassword: string): void {
 sessionStorage.setItem(KEY, btoa(${username}:));
}

export function getAuthHeader(): string | null {
 if (typeof window === \undefined\) return null;
 const v = sessionStorage.getItem(KEY);
 return v ? Basic : null;
}

export function clearCredentials(): void {
 if (typeof window !== \undefined\) sessionStorage.removeItem(KEY);
}

export function hasCredentials(): boolean {
 if (typeof window === \undefined\) return false;
 return Boolean(sessionStorage.getItem(KEY));
}

export interface TradingSession {
  name: string;
  /** UTC hour (0–23) when the session opens. */
  openHourUtc: number;
  /** UTC hour (0–23) when the session closes. */
  closeHourUtc: number;
  /** Display string e.g. "07:00". */
  openUtc: string;
  closeUtc: string;
}

export const TRADING_SESSIONS: Record<string, TradingSession> = {
  SYDNEY: {
    name: "Sydney",
    openHourUtc: 21,
    closeHourUtc: 6,
    openUtc: "21:00",
    closeUtc: "06:00",
  },
  TOKYO: {
    name: "Tokyo",
    openHourUtc: 0,
    closeHourUtc: 9,
    openUtc: "00:00",
    closeUtc: "09:00",
  },
  LONDON: {
    name: "London",
    openHourUtc: 7,
    closeHourUtc: 16,
    openUtc: "07:00",
    closeUtc: "16:00",
  },
  LONDON_AM: {
    name: "London-AM",
    openHourUtc: 7,
    closeHourUtc: 11,
    openUtc: "07:00",
    closeUtc: "11:00",
  },
  NEW_YORK: {
    name: "New York",
    openHourUtc: 12,
    closeHourUtc: 21,
    openUtc: "12:00",
    closeUtc: "21:00",
  },
  LONDON_NEW_YORK_OVERLAP: {
    name: "London-NY Overlap",
    openHourUtc: 12,
    closeHourUtc: 16,
    openUtc: "12:00",
    closeUtc: "16:00",
  },
};

/**
 * Return the trading session active for a given UTC hour.
 * Returns null outside any high-activity session window.
 */
export function activeSession(utcHour: number): TradingSession | null {
  const h = ((utcHour % 24) + 24) % 24;

  // Priority: London-NY overlap > London-AM > NY > London > Tokyo > Sydney
  if (h >= 12 && h < 16) return TRADING_SESSIONS.LONDON_NEW_YORK_OVERLAP;
  if (h >= 7 && h < 11) return TRADING_SESSIONS.LONDON_AM;
  if (h >= 11 && h < 16) return TRADING_SESSIONS.LONDON;
  if (h >= 16 && h < 21) return TRADING_SESSIONS.NEW_YORK;
  if (h >= 0 && h < 9) return TRADING_SESSIONS.TOKYO;
  if (h >= 21 || h < 6) return TRADING_SESSIONS.SYDNEY;

  return null;
}

/** Return the active session name for the current UTC time. */
export function currentSessionName(): string {
  const utcHour = new Date().getUTCHours();
  return activeSession(utcHour)?.name ?? "Off-hours";
}

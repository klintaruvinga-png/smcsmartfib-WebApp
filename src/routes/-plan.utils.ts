import type { TradePlan } from "@/types/sniper";

type InstrumentType = "forex" | "metal" | "crypto" | "index";

const SYMBOL_ALIASES: Record<string, string> = {
  NASDAQ: "NAS100",
  NASDAQ100: "NAS100",
  USTECH100: "NAS100",
  USTECH: "NAS100",
  WALLSTREET: "US30",
  WALLSTREET30: "US30",
  DOW30: "US30",
  DJ30: "US30",
  USSP500: "SPX500",
  USSP: "SPX500",
  US500: "SPX500",
  SP500: "SPX500",
  GOLD: "XAUUSD",
  SILVER: "XAGUSD",
  DAX: "GER40",
  DAX40: "GER40",
  GERMANY40: "GER40",
  DEDE40: "GER40",
};

const INSTRUMENT_TYPES: Record<string, InstrumentType> = {
  XAUUSD: "metal",
  XAGUSD: "metal",
  BTCUSD: "crypto",
  ETHUSD: "crypto",
  XRPUSD: "crypto",
  BNBUSD: "crypto",
  SOLUSD: "crypto",
  US30: "index",
  NAS100: "index",
  SPX500: "index",
  GER40: "index",
};

export const MIN_EXECUTABLE_STAGE_LOT = 0.01;

const BROKER_SUFFIXES = ["MICRO", "PRO", "ECN", "STP", "RAW", "M", "R", "A", "B", "C"] as const;

function resolveKnownPlanToken(token: string): string | null {
  const aliased = SYMBOL_ALIASES[token] ?? token;
  return aliased in INSTRUMENT_TYPES || token in SYMBOL_ALIASES ? aliased : null;
}

function normalizePlanSymbol(symbol: string | null | undefined): string {
  const token = (symbol ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const directMatch = resolveKnownPlanToken(token);
  if (directMatch) return directMatch;

  for (const suffix of BROKER_SUFFIXES) {
    if (!token.endsWith(suffix) || token.length <= suffix.length) continue;

    const suffixStrippedMatch = resolveKnownPlanToken(token.slice(0, -suffix.length));
    if (suffixStrippedMatch) return suffixStrippedMatch;
  }

  return token;
}

export function getMinExecutableStageLot(symbol?: string): number {
  const token = normalizePlanSymbol(symbol);
  const instrumentType = INSTRUMENT_TYPES[token] ?? "forex";
  return instrumentType === "metal" || instrumentType === "crypto" || instrumentType === "index"
    ? 0.1
    : MIN_EXECUTABLE_STAGE_LOT;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isExecutableStageLotValue(value: unknown, symbol?: string): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= getMinExecutableStageLot(symbol)
  );
}

export function isTradePlanComplete(plan: TradePlan): boolean {
  return [
    plan.tps?.tp1,
    plan.tps?.tp2,
    plan.tps?.tp3,
    plan.rr?.tp1,
    plan.rr?.tp2,
    plan.rr?.tp3,
  ].every(isPositiveFinite);
}

function stageLotValues(plan: TradePlan) {
  return [plan.lotSize?.e1, plan.lotSize?.e2, plan.lotSize?.e3];
}

export function hasExecutableStageLots(plan: TradePlan): boolean {
  return stageLotValues(plan).some((value) => isExecutableStageLotValue(value, plan.symbol));
}

export function hasSkippedStageLots(plan: TradePlan): boolean {
  return stageLotValues(plan).some((value) => !isExecutableStageLotValue(value, plan.symbol));
}

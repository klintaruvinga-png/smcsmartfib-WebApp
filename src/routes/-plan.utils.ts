import type { TradePlan } from "@/types/sniper";

export const MIN_EXECUTABLE_STAGE_LOT = 0.01;

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isExecutableStageLotValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_EXECUTABLE_STAGE_LOT;
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
  return stageLotValues(plan).some(isExecutableStageLotValue);
}

export function hasSkippedStageLots(plan: TradePlan): boolean {
  return stageLotValues(plan).some((value) => !isExecutableStageLotValue(value));
}

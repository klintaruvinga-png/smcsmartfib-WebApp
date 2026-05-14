import type { TradePlan } from "@/types/sniper";

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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

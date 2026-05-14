import type { TradePlan } from "@/types/sniper";

export function isTradePlanComplete(plan: TradePlan): boolean {
  return !(
    plan.tps.tp2 <= 0 ||
    plan.tps.tp3 <= 0 ||
    plan.rr.tp1 <= 0 ||
    plan.rr.tp2 <= 0 ||
    plan.rr.tp3 <= 0
  );
}

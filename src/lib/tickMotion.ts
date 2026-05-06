import type { CSSProperties } from "react";

export interface TickMotionOptions {
  baseDurationMs: number;
  durationSpreadMs: number;
  delayMaxMs: number;
  dotBaseDurationMs?: number;
  dotDurationSpreadMs?: number;
  dotDelayMaxMs?: number;
}

export interface TickMotionEvent {
  motionKey?: number | string;
  motionImpulse?: number;
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function ranged(hash: number, base: number, spread: number): number {
  return base + (spread > 0 ? hash % (spread + 1) : 0);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function tickMotionHoldMs({
  baseDurationMs,
  durationSpreadMs,
  delayMaxMs,
  dotBaseDurationMs = baseDurationMs,
  dotDurationSpreadMs = durationSpreadMs,
  dotDelayMaxMs = delayMaxMs,
}: TickMotionOptions): number {
  const flashTotal = baseDurationMs + durationSpreadMs + delayMaxMs;
  const dotTotal = dotBaseDurationMs + dotDurationSpreadMs + dotDelayMaxMs;
  // Leave one frame of slack so the class survives until the CSS animation completes.
  return Math.max(flashTotal, dotTotal) + 16;
}

export function tickMotionStyle(
  key: string,
  {
    baseDurationMs,
    durationSpreadMs,
    delayMaxMs,
    dotBaseDurationMs = baseDurationMs,
    dotDurationSpreadMs = durationSpreadMs,
    dotDelayMaxMs = delayMaxMs,
  }: TickMotionOptions,
  motionEvent?: TickMotionEvent,
): CSSProperties {
  const impulse = clamp01(motionEvent?.motionImpulse ?? 0);
  const eventKey = motionEvent?.motionKey ?? "steady";
  const durationHash = hashString(`${key}:${eventKey}:duration`);
  const delayHash = hashString(`${key}:${eventKey}:delay`);
  const dotDurationHash = hashString(`${key}:${eventKey}:dot-duration`);
  const dotDelayHash = hashString(`${key}:${eventKey}:dot-delay`);
  const durationBase = baseDurationMs + Math.round(baseDurationMs * 0.14 * impulse);
  const durationSpread = Math.max(12, Math.round(durationSpreadMs * (0.55 + impulse * 0.8)));
  const delaySpread = Math.max(0, Math.round(delayMaxMs * (1.05 - impulse * 0.65)));
  const dotDurationBase = dotBaseDurationMs + Math.round(dotBaseDurationMs * 0.12 * impulse);
  const dotDurationSpread = Math.max(12, Math.round(dotDurationSpreadMs * (0.5 + impulse * 0.9)));
  const dotDelaySpread = Math.max(0, Math.round(dotDelayMaxMs * (1.05 - impulse * 0.6)));

  return {
    "--tick-flash-duration": `${ranged(durationHash, durationBase, durationSpread)}ms`,
    "--tick-flash-delay": `${ranged(delayHash, 0, delaySpread)}ms`,
    "--tick-flash-dot-duration": `${ranged(dotDurationHash, dotDurationBase, dotDurationSpread)}ms`,
    "--tick-flash-dot-delay": `${ranged(dotDelayHash, 0, dotDelaySpread)}ms`,
  } as CSSProperties;
}

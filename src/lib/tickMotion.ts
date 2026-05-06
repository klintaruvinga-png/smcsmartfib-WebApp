import type { CSSProperties } from "react";

export interface TickMotionOptions {
  baseDurationMs: number;
  durationSpreadMs: number;
  delayMaxMs: number;
  dotBaseDurationMs?: number;
  dotDurationSpreadMs?: number;
  dotDelayMaxMs?: number;
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
): CSSProperties {
  const durationHash = hashString(`${key}:duration`);
  const delayHash = hashString(`${key}:delay`);
  const dotDurationHash = hashString(`${key}:dot-duration`);
  const dotDelayHash = hashString(`${key}:dot-delay`);

  return {
    "--tick-flash-duration": `${ranged(durationHash, baseDurationMs, durationSpreadMs)}ms`,
    "--tick-flash-delay": `${ranged(delayHash, 0, delayMaxMs)}ms`,
    "--tick-flash-dot-duration": `${ranged(dotDurationHash, dotBaseDurationMs, dotDurationSpreadMs)}ms`,
    "--tick-flash-dot-delay": `${ranged(dotDelayHash, 0, dotDelayMaxMs)}ms`,
  } as CSSProperties;
}

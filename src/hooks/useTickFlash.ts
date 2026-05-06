import { useEffect, useRef, useState } from "react";

export type TickDirection = "up" | "down" | null;

function toFiniteNumber(value: number | string | undefined | null): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Returns a transient direction ("up" | "down") whenever `value` changes,
 * which auto-clears after `durationMs`. Use to drive a flash/highlight
 * animation when a numeric value updates from polling.
 */
export function useTickFlash(value: number | undefined, durationMs = 700): TickDirection {
  const numericValue = toFiniteNumber(value);
  const prev = useRef<number | undefined>(numericValue);
  const [dir, setDir] = useState<TickDirection>(null);

  useEffect(() => {
    if (numericValue === undefined) return;
    const previous = prev.current;
    if (previous !== undefined && Number.isFinite(previous) && numericValue !== previous) {
      setDir(numericValue > previous ? "up" : "down");
      const t = window.setTimeout(() => setDir(null), durationMs);
      prev.current = numericValue;
      return () => window.clearTimeout(t);
    }
    prev.current = numericValue;
  }, [numericValue, durationMs]);

  return dir;
}

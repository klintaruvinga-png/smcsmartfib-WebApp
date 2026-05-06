import { useEffect, useRef, useState } from "react";

export type TickDirection = "up" | "down" | null;

/**
 * Returns a transient direction ("up" | "down") whenever `value` changes,
 * which auto-clears after `durationMs`. Use to drive a flash/highlight
 * animation when a numeric value updates from polling.
 */
export function useTickFlash(value: number | undefined, durationMs = 700): TickDirection {
  const prev = useRef<number | undefined>(value);
  const [dir, setDir] = useState<TickDirection>(null);

  useEffect(() => {
    if (value === undefined || !Number.isFinite(value)) return;
    const previous = prev.current;
    if (previous !== undefined && Number.isFinite(previous) && value !== previous) {
      setDir(value > previous ? "up" : "down");
      const t = window.setTimeout(() => setDir(null), durationMs);
      prev.current = value;
      return () => window.clearTimeout(t);
    }
    prev.current = value;
  }, [value, durationMs]);

  return dir;
}

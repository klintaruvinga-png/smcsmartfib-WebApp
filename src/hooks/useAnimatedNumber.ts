import { useEffect, useRef, useState } from "react";

function toFiniteNumber(value: number | undefined | null): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

export type AnimationDirection = "up" | "down" | null;

export interface AnimatedNumberResult {
  value: number | undefined;
  direction: AnimationDirection;
}

export function useAnimatedNumber(
  value: number | undefined,
  durationMs = 300,
  holdMs = durationMs,
): AnimatedNumberResult {
  const numericValue = toFiniteNumber(value);
  const safeDurationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 300;
  const safeHoldMs = Number.isFinite(holdMs) && holdMs > 0 ? holdMs : safeDurationMs;
  const [animated, setAnimated] = useState<number | undefined>(numericValue);
  const [direction, setDirection] = useState<AnimationDirection>(null);

  const rafRef = useRef<number | null>(null);
  const directionTimeoutRef = useRef<number | null>(null);
  const fromRef = useRef<number>(numericValue ?? 0);
  const toRef = useRef<number>(numericValue ?? 0);
  const currentRef = useRef<number>(numericValue ?? 0);
  const hasValueRef = useRef(numericValue !== undefined);
  const durationRef = useRef(safeDurationMs);
  durationRef.current = safeDurationMs;

  useEffect(() => {
    if (numericValue === undefined) {
      if (rafRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (directionTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(directionTimeoutRef.current);
        directionTimeoutRef.current = null;
      }
      hasValueRef.current = false;
      setAnimated(undefined);
      setDirection(null);
      return;
    }

    if (!hasValueRef.current) {
      hasValueRef.current = true;
      fromRef.current = numericValue;
      toRef.current = numericValue;
      currentRef.current = numericValue;
      setAnimated(numericValue);
      setDirection(null);
      return;
    }

    const prev = toRef.current;
    const dir: AnimationDirection =
      numericValue > prev ? "up" : numericValue < prev ? "down" : null;

    if (directionTimeoutRef.current !== null) {
      window.clearTimeout(directionTimeoutRef.current);
      directionTimeoutRef.current = null;
    }
    setDirection(dir);
    if (dir !== null) {
      directionTimeoutRef.current = window.setTimeout(() => {
        directionTimeoutRef.current = null;
        setDirection(null);
      }, safeHoldMs);
    }

    fromRef.current = Number.isFinite(currentRef.current) ? currentRef.current : numericValue;
    toRef.current = numericValue;

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (dir === null || prefersReducedMotion() || typeof window === "undefined") {
      currentRef.current = numericValue;
      setAnimated(numericValue);
      return;
    }

    const start = performance.now();

    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationRef.current);
      const eased = progress * (2 - progress);
      const interpolated = fromRef.current + (toRef.current - fromRef.current) * eased;

      currentRef.current = interpolated;
      setAnimated(interpolated);

      if (progress < 1) {
        rafRef.current = window.requestAnimationFrame(step);
      } else {
        currentRef.current = toRef.current;
        rafRef.current = null;
        setAnimated(toRef.current);
      }
    };

    rafRef.current = window.requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [numericValue]);

  return { value: animated, direction };
}

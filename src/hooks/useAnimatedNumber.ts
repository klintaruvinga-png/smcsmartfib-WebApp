import { useEffect, useRef, useState } from "react";

function toFiniteNumber(value: number | undefined | null): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function compressImpulse(value: number): number {
  return 1 - Math.exp(-Math.max(0, value) * 900);
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleNormal(random: () => number): number {
  const u1 = Math.max(random(), 1e-7);
  const u2 = Math.max(random(), 1e-7);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function hermiteInterpolate(start: number, end: number, startSlope: number, endSlope: number, t: number) {
  const tt = t * t;
  const ttt = tt * t;
  const h00 = 2 * ttt - 3 * tt + 1;
  const h10 = ttt - 2 * tt + t;
  const h01 = -2 * ttt + 3 * tt;
  const h11 = ttt - tt;
  return h00 * start + h10 * startSlope + h01 * end + h11 * endSlope;
}

type MotionSpace = "log" | "linear";

interface MotionSample {
  elapsedSec: number;
  movement: number;
  space: MotionSpace;
}

interface MotionProfileOptions {
  from: number;
  to: number;
  elapsedSec: number;
  driftPerSec: number;
  volatilityPerSqrtSec: number;
  seed: number;
  space: MotionSpace;
}

function getMotionSpace(from: number, to: number): MotionSpace {
  return from > 0 && to > 0 ? "log" : "linear";
}

function measureMovement(from: number, to: number, space: MotionSpace): number {
  if (space === "log") {
    return Math.log(to / from);
  }
  return to - from;
}

function measureImpulse(from: number, to: number, space: MotionSpace): number {
  if (space === "log") {
    return Math.abs(Math.log(to / from));
  }
  return Math.abs(to - from) / Math.max(Math.abs(from), 1);
}

function estimateMotionStats(
  samples: MotionSample[],
  space: MotionSpace,
): { driftPerSec: number; volatilityPerSqrtSec: number } {
  const filtered = samples.filter((sample) => sample.space === space && sample.elapsedSec > 0);
  if (filtered.length === 0) {
    return { driftPerSec: 0, volatilityPerSqrtSec: 0 };
  }

  const elapsedTotal = filtered.reduce((sum, sample) => sum + sample.elapsedSec, 0);
  if (elapsedTotal <= 0) {
    return { driftPerSec: 0, volatilityPerSqrtSec: 0 };
  }

  const driftPerSec = filtered.reduce((sum, sample) => sum + sample.movement, 0) / elapsedTotal;
  const variance =
    filtered.reduce((sum, sample) => {
      const residual = sample.movement - driftPerSec * sample.elapsedSec;
      return sum + residual * residual;
    }, 0) / elapsedTotal;

  return {
    driftPerSec,
    volatilityPerSqrtSec: Math.sqrt(Math.max(variance, 0)),
  };
}

function createMotionProfile({
  from,
  to,
  elapsedSec,
  driftPerSec,
  volatilityPerSqrtSec,
  seed,
  space,
}: MotionProfileOptions): (progress: number) => number {
  const realizedMovement = measureMovement(from, to, space);
  const driftMovement = driftPerSec * elapsedSec;
  const slopeLimit =
    Math.abs(realizedMovement) * 0.9 +
    (space === "log" ? 0.00018 : Math.max(Math.abs(to - from) * 0.055, 0.008));
  const shapedSlope = clamp(driftMovement, -slopeLimit, slopeLimit);
  const realizedScale =
    space === "log" ? Math.abs(realizedMovement) : Math.abs(realizedMovement) / Math.max(Math.abs(from), 1);
  const amplitudeCap =
    space === "log"
      ? Math.abs(realizedMovement) * 0.42 + 0.00075
      : Math.abs(to - from) * 0.4 + Math.max(Math.abs(from), 1) * 0.0011;
  const volatilityAmplitude =
    space === "log"
      ? volatilityPerSqrtSec * Math.sqrt(elapsedSec)
      : volatilityPerSqrtSec * Math.sqrt(elapsedSec) * Math.max(Math.abs(from), 1);
  const amplitude = Math.min(
    amplitudeCap,
    Math.max(
      amplitudeCap * 0.08,
      volatilityAmplitude * 0.42,
      realizedScale * (space === "log" ? 0.14 : Math.max(Math.abs(from), 1) * 0.1),
    ),
  );
  const random = createSeededRandom(seed);
  const bridgeKnots = [0, 0.24, 0.5, 0.76, 1].map((progress, index, points) => {
    if (index === 0 || index === points.length - 1) {
      return { progress, shock: 0 };
    }
    const envelope = Math.pow(Math.sin(Math.PI * progress), 1.45);
    return {
      progress,
      shock: sampleNormal(random) * amplitude * envelope,
    };
  });
  const driftBias = clamp(shapedSlope * 0.2, -amplitude * 0.4, amplitude * 0.4);

  const sampleBridge = (progress: number) => {
    for (let i = 1; i < bridgeKnots.length; i += 1) {
      if (progress <= bridgeKnots[i].progress) {
        const start = bridgeKnots[i - 1];
        const end = bridgeKnots[i];
        const span = end.progress - start.progress || 1;
        const mix = (progress - start.progress) / span;
        return start.shock + (end.shock - start.shock) * mix;
      }
    }
    return 0;
  };

  return (progress: number) => {
    const t = clamp01(progress);
    const bridgeEnvelope = Math.pow(Math.sin(Math.PI * t), 1.35);
    const trendArc = driftBias * bridgeEnvelope;
    const bridgeShock = sampleBridge(t) * bridgeEnvelope * 0.78;
    const movement = hermiteInterpolate(0, realizedMovement, shapedSlope, shapedSlope, t) + trendArc + bridgeShock;

    if (space === "log") {
      return from * Math.exp(movement);
    }
    return from + movement;
  };
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
  heldDirection: AnimationDirection;
  motionKey: number;
  motionImpulse: number;
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
  const [heldDirection, setHeldDirection] = useState<AnimationDirection>(null);

  const rafRef = useRef<number | null>(null);
  const directionTimeoutRef = useRef<number | null>(null);
  const fromRef = useRef<number>(numericValue ?? 0);
  const toRef = useRef<number>(numericValue ?? 0);
  const currentRef = useRef<number>(numericValue ?? 0);
  const hasValueRef = useRef(numericValue !== undefined);
  const motionKeyRef = useRef(0);
  const motionImpulseRef = useRef(0);
  const lastUpdateAtRef = useRef<number | null>(null);
  const motionSamplesRef = useRef<MotionSample[]>([]);
  const randomSeedRef = useRef((Math.random() * 0xffffffff) >>> 0);
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
      lastUpdateAtRef.current = null;
      motionSamplesRef.current = [];
      setAnimated(undefined);
      setDirection(null);
      setHeldDirection(null);
      return;
    }

    if (!hasValueRef.current) {
      hasValueRef.current = true;
      fromRef.current = numericValue;
      toRef.current = numericValue;
      currentRef.current = numericValue;
      lastUpdateAtRef.current =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      setAnimated(numericValue);
      setDirection(null);
      setHeldDirection(null);
      return;
    }

    const prev = toRef.current;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsedMs = clamp(now - (lastUpdateAtRef.current ?? now - safeDurationMs), 180, 6000);
    lastUpdateAtRef.current = now;
    const dir: AnimationDirection =
      numericValue > prev ? "up" : numericValue < prev ? "down" : null;

    if (directionTimeoutRef.current !== null) {
      window.clearTimeout(directionTimeoutRef.current);
      directionTimeoutRef.current = null;
    }
    setDirection(dir);
    if (dir !== null) {
      setHeldDirection(dir);
      directionTimeoutRef.current = window.setTimeout(() => {
        directionTimeoutRef.current = null;
        setDirection(null);
      }, safeHoldMs);
    }

    if (dir !== null) {
      const space = getMotionSpace(prev, numericValue);
      const elapsedSec = elapsedMs / 1000;
      const motionStats = estimateMotionStats(motionSamplesRef.current, space);
      const motionProfile = createMotionProfile({
        from: Number.isFinite(currentRef.current) ? currentRef.current : prev,
        to: numericValue,
        elapsedSec,
        driftPerSec: motionStats.driftPerSec,
        volatilityPerSqrtSec: motionStats.volatilityPerSqrtSec,
        seed:
          randomSeedRef.current ^
          (motionKeyRef.current + 1) ^
          Math.round(elapsedMs) ^
          Math.round(Math.abs(numericValue) * 100000),
        space,
      });
      motionKeyRef.current += 1;
      motionImpulseRef.current = compressImpulse(measureImpulse(prev, numericValue, space));
      motionSamplesRef.current = [
        ...motionSamplesRef.current.slice(-11),
        { elapsedSec, movement: measureMovement(prev, numericValue, space), space },
      ];

      fromRef.current = Number.isFinite(currentRef.current) ? currentRef.current : numericValue;
      toRef.current = numericValue;

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (prefersReducedMotion() || typeof window === "undefined") {
        currentRef.current = numericValue;
        setAnimated(numericValue);
        return;
      }

      const start = performance.now();
      const step = (frameNow: number) => {
        const elapsed = frameNow - start;
        const progress = Math.min(1, elapsed / durationRef.current);
        const interpolated = motionProfile(progress);

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
    }

    fromRef.current = Number.isFinite(currentRef.current) ? currentRef.current : numericValue;
    toRef.current = numericValue;

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    currentRef.current = numericValue;
    setAnimated(numericValue);
  }, [numericValue]);

  return {
    value: animated,
    direction,
    heldDirection,
    motionKey: motionKeyRef.current,
    motionImpulse: motionImpulseRef.current,
  };
}

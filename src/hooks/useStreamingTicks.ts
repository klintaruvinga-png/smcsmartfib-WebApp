import { useEffect, useRef, useState } from "react";

/**
 * useStreamingTicks
 *
 * Turns a slow polled value (e.g. arrives every ~2s) into a stream of
 * jittered intermediate ticks so the UI feels like a live market feed
 * instead of a synchronized poll strobe.
 *
 * On each new `target`:
 *   - sample drift/vol from recent realized moves
 *   - build a bounded GBM (log) / arithmetic-bridge (linear) path from
 *     the last emitted value to `target`
 *   - schedule N (random 4–9) sub-ticks at randomized cumulative offsets
 *     across ~85% of `pollMs`
 *   - each sub-tick: setValue -> direction flip vs previous sub-tick ->
 *     motionKey bump -> auto-clearing direction state
 *   - last sub-tick snaps to the exact backend `target`
 *
 * Per-instance random seed + per-update reseed ensures different cards/
 * fields desynchronize naturally.
 */

export type TickDirection = "up" | "down" | null;

export interface StreamingTickResult {
  value: number | undefined;
  direction: TickDirection;
  heldDirection: TickDirection;
  motionKey: number;
  motionImpulse: number;
}

function toFiniteNumber(v: number | undefined | null): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function compressImpulse(x: number) {
  return 1 - Math.exp(-Math.max(0, x) * 900);
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-7);
  const u2 = Math.max(rand(), 1e-7);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

interface MoveSample {
  dtSec: number;
  logMove: number; // log-space move (or relative move if linear)
  space: "log" | "linear";
}

export function useStreamingTicks(
  target: number | undefined,
  pollMsHint = 2000,
  holdMs = 700,
): StreamingTickResult {
  const numericTarget = toFiniteNumber(target);

  const [value, setValue] = useState<number | undefined>(numericTarget);
  const [direction, setDirection] = useState<TickDirection>(null);
  const [heldDirection, setHeldDirection] = useState<TickDirection>(null);
  const [motionKey, setMotionKey] = useState(0);
  const [motionImpulse, setMotionImpulse] = useState(0);

  const lastEmittedRef = useRef<number | undefined>(numericTarget);
  const lastTargetRef = useRef<number | undefined>(numericTarget);
  const lastUpdateAtRef = useRef<number | null>(null);
  const samplesRef = useRef<MoveSample[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const dirClearRef = useRef<number | null>(null);
  const rngSeedRef = useRef<number>(((Math.random() * 0xffffffff) | 0) >>> 0);
  const motionKeyRef = useRef(0);

  function clearScheduled() {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
    if (dirClearRef.current !== null) {
      window.clearTimeout(dirClearRef.current);
      dirClearRef.current = null;
    }
  }

  useEffect(() => {
    if (numericTarget === undefined) {
      clearScheduled();
      lastEmittedRef.current = undefined;
      lastTargetRef.current = undefined;
      setValue(undefined);
      setDirection(null);
      setHeldDirection(null);
      return;
    }

    // First value — just seed.
    if (lastTargetRef.current === undefined || lastEmittedRef.current === undefined) {
      lastTargetRef.current = numericTarget;
      lastEmittedRef.current = numericTarget;
      lastUpdateAtRef.current = performance.now();
      setValue(numericTarget);
      return;
    }

    const prevTarget = lastTargetRef.current;
    if (numericTarget === prevTarget) return;

    const now = performance.now();
    const elapsedSec = clamp(
      (now - (lastUpdateAtRef.current ?? now) || pollMsHint) / 1000,
      0.2,
      10,
    );
    lastUpdateAtRef.current = now;
    lastTargetRef.current = numericTarget;

    const space: "log" | "linear" = prevTarget > 0 && numericTarget > 0 ? "log" : "linear";
    const realizedMove =
      space === "log" ? Math.log(numericTarget / prevTarget) : numericTarget - prevTarget;

    // Push sample for drift/vol estimation.
    samplesRef.current = [
      ...samplesRef.current.slice(-11),
      { dtSec: elapsedSec, logMove: realizedMove, space },
    ];

    const driftPerSec = (() => {
      const same = samplesRef.current.filter((s) => s.space === space);
      const totalDt = same.reduce((a, s) => a + s.dtSec, 0);
      if (totalDt <= 0) return 0;
      return same.reduce((a, s) => a + s.logMove, 0) / totalDt;
    })();
    const volPerSqrtSec = (() => {
      const same = samplesRef.current.filter((s) => s.space === space);
      const totalDt = same.reduce((a, s) => a + s.dtSec, 0);
      if (totalDt <= 0) return 0;
      const variance =
        same.reduce((a, s) => {
          const r = s.logMove - driftPerSec * s.dtSec;
          return a + r * r;
        }, 0) / totalDt;
      return Math.sqrt(Math.max(variance, 0));
    })();

    // Cancel any pending sub-ticks from the previous poll.
    clearScheduled();

    // Reseed each update so symbols/fields don't fall into a shared cycle.
    rngSeedRef.current = (rngSeedRef.current ^ ((now | 0) * 2654435761)) >>> 0;
    const rand = makeRng(rngSeedRef.current);

    // Window we get to play in: ~85% of the poll interval, leaving slack
    // before the next backend update arrives.
    const windowMs = Math.max(400, pollMsHint * 0.85);
    // Number of sub-ticks 4..9 — keeps cadence irregular across cards.
    const N = 4 + Math.floor(rand() * 6);

    // Build randomized cumulative timing offsets that sum to windowMs.
    // Use Dirichlet-ish sampling via exponential variates.
    const intervals: number[] = [];
    let intervalSum = 0;
    for (let i = 0; i < N; i += 1) {
      const e = -Math.log(Math.max(rand(), 1e-7));
      intervals.push(e);
      intervalSum += e;
    }
    // Floor each interval at ~70ms so flashes don't overlap into a blur.
    const minStep = 70;
    const offsets: number[] = [];
    let acc = 0;
    for (let i = 0; i < N; i += 1) {
      const raw = (intervals[i] / intervalSum) * (windowMs - minStep * N);
      acc += minStep + Math.max(0, raw);
      offsets.push(acc);
    }

    const startVal = lastEmittedRef.current;
    const seedForBridge = rngSeedRef.current;
    const bridgeRand = makeRng(seedForBridge ^ 0x9e3779b9);

    // Pre-sample bridge knots in [0,1] for hermite-like noise overlay.
    const knotShocks = [0.2, 0.4, 0.6, 0.8].map((p) => {
      const envelope = Math.pow(Math.sin(Math.PI * p), 1.4);
      const base =
        space === "log"
          ? volPerSqrtSec * Math.sqrt(elapsedSec)
          : volPerSqrtSec * Math.sqrt(elapsedSec) * Math.max(Math.abs(prevTarget), 1);
      const amp = Math.min(
        Math.abs(realizedMove) * 0.5 + (space === "log" ? 0.0008 : Math.abs(prevTarget) * 0.0012),
        Math.max(base * 0.45, Math.abs(realizedMove) * 0.18),
      );
      return { p, shock: gauss(bridgeRand) * amp * envelope };
    });

    function bridgeAt(progress: number): number {
      // Interpolate base path
      const driftedMove =
        realizedMove * progress + driftPerSec * (1 - progress) * progress * elapsedSec * 0.15;
      // Add overshoot/undershoot noise from knots
      let noise = 0;
      for (let i = 0; i < knotShocks.length; i += 1) {
        const k = knotShocks[i];
        const dist = Math.abs(progress - k.p);
        const w = Math.max(0, 1 - dist * 4); // narrow gaussian-ish window
        noise += k.shock * w;
      }
      const envelope = Math.pow(Math.sin(Math.PI * progress), 1.2);
      const totalMove = driftedMove + noise * envelope;
      if (space === "log") return startVal * Math.exp(totalMove);
      return startVal + totalMove;
    }

    // Schedule sub-ticks.
    let prevEmitted = startVal;
    for (let i = 0; i < N; i += 1) {
      const isFinal = i === N - 1;
      const delay = offsets[i];
      const id = window.setTimeout(() => {
        const v = isFinal ? numericTarget : bridgeAt((i + 1) / N);
        const dir: TickDirection = v > prevEmitted ? "up" : v < prevEmitted ? "down" : null;
        prevEmitted = v;
        lastEmittedRef.current = v;

        setValue(v);
        if (dir !== null) {
          motionKeyRef.current += 1;
          const impulse =
            space === "log"
              ? compressImpulse(Math.abs(Math.log(v / (prevTarget || v))))
              : compressImpulse(Math.abs(v - prevTarget) / Math.max(Math.abs(prevTarget), 1));
          setMotionKey(motionKeyRef.current);
          setMotionImpulse(impulse);
          setDirection(dir);
          setHeldDirection(dir);
          if (dirClearRef.current !== null) window.clearTimeout(dirClearRef.current);
          dirClearRef.current = window.setTimeout(() => {
            dirClearRef.current = null;
            setDirection(null);
          }, holdMs);
        }
      }, delay);
      timeoutsRef.current.push(id);
    }

    return () => {
      // Don't clear here — we want scheduled flashes to play out.
      // They get cleared when the *next* target arrives.
    };
  }, [numericTarget, pollMsHint, holdMs]);

  useEffect(() => () => clearScheduled(), []);

  return { value, direction, heldDirection, motionKey, motionImpulse };
}

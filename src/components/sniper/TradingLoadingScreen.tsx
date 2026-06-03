import { useEffect, useState } from "react";

const MESSAGES = [
  "Lighting candles...",
  "Calibrating Fibonacci levels...",
  "Scanning for liquidity voids...",
  "Checking backend readiness...",
  "Building your signal board...",
  "Waiting for backend confirmation...",
] as const;

type TradingLoadingScreenProps = {
  backendReady: boolean;
  onReady: () => void;
  minHoldMs?: number;
};

export function TradingLoadingScreen({
  backendReady,
  onReady,
  minHoldMs = 3000,
}: TradingLoadingScreenProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [holdElapsed, setHoldElapsed] = useState(false);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMessageIndex((index) => (index + 1) % MESSAGES.length);
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setHoldElapsed(true), minHoldMs);

    return () => window.clearTimeout(timeoutId);
  }, [minHoldMs]);

  useEffect(() => {
    if (backendReady && holdElapsed) {
      onReady();
    }
  }, [backendReady, holdElapsed, onReady]);

  return (
    <div className="flex min-h-[60vh] select-none flex-col items-center justify-center gap-8">
      <div className="flex flex-col items-center gap-3">
        <div className="brand-mark flex h-14 w-14 items-center justify-center rounded-lg shadow-lg">
          <svg
            viewBox="0 0 32 32"
            className="h-7 w-7"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <line
              x1="16"
              y1="4"
              x2="16"
              y2="28"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="text-accent-2 opacity-50"
            />
            <rect
              x="10"
              y="10"
              width="12"
              height="12"
              rx="1.5"
              fill="currentColor"
              className="text-accent"
              style={{ animation: "candle-body 1.8s ease-out forwards" }}
            />
          </svg>
        </div>
        <div className="text-center">
          <div className="text-sm font-semibold tracking-tight text-tx">SMC SuperFIB</div>
          <div className="mt-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-mute">
            Signal Intelligence Platform
          </div>
        </div>
      </div>

      <div className="h-0.5 w-48 overflow-hidden rounded-full bg-bd">
        <div
          className="h-full rounded-full bg-accent"
          style={{ animation: "loading-sweep 3s ease-in-out infinite" }}
        />
      </div>

      <div
        key={messageIndex}
        className="text-xs font-mono tracking-wide text-mute"
        style={{ animation: "fade-in 0.4s ease-out" }}
      >
        {MESSAGES[messageIndex]}
      </div>
    </div>
  );
}

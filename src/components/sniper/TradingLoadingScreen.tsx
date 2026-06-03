import { useEffect, useState } from "react";
import { BrandPulseLogo } from "@/components/sniper/BrandPulseLogo";
import { ALL_LOADING_MESSAGES, nextRandomIndex } from "@/components/sniper/loadingMessages";

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

  // Randomized message rotation with no repeated consecutive messages.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMessageIndex((index) => nextRandomIndex(index, ALL_LOADING_MESSAGES.length));
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
      <div className="flex flex-col items-center gap-4">
        <BrandPulseLogo size="lg" animated />
        <div className="text-center">
          <div className="text-base font-semibold tracking-tight text-tx">SMC SuperFIB</div>
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
        {ALL_LOADING_MESSAGES[messageIndex]}
      </div>
    </div>
  );
}

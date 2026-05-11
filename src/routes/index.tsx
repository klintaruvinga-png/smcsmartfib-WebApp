import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { hasCredentials, hasWordPressNonce } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: LandingLoader,
});

const DEFAULT_LANDING_DELAY_MS = 1200;
const parsed = Number(import.meta.env.VITE_LANDING_LOADER_DELAY_MS);
const LANDING_DELAY_MS =
  Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_LANDING_DELAY_MS;

function LandingLoader() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Trigger enter transition on next frame.
    const raf = requestAnimationFrame(() => setMounted(true));

    // Begin leave transition slightly before navigation for a smooth fade.
    const leaveAt = Math.max(0, LANDING_DELAY_MS - 250);
    const leaveTimer = setTimeout(() => setLeaving(true), leaveAt);

    const navTimer = setTimeout(() => {
      const authed = hasCredentials() || hasWordPressNonce();
      router.navigate({ to: authed ? "/plan" : "/login" });
    }, LANDING_DELAY_MS);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(leaveTimer);
      clearTimeout(navTimer);
    };
  }, [router]);

  const visible = mounted && !leaving;

  return (
    <div
      className={[
        "flex min-h-screen items-center justify-center bg-bg px-4",
        "transition-opacity duration-500 ease-out",
        leaving ? "opacity-0" : "opacity-100",
      ].join(" ")}
    >
      <div
        className={[
          "flex flex-col items-center gap-5",
          "transform-gpu transition-all duration-700 ease-out",
          visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-95",
        ].join(" ")}
      >
        <div className="brand-mark flex h-14 w-14 items-center justify-center rounded-xl animate-pulse">
          <Activity className="h-7 w-7 text-[#1a1208]" strokeWidth={2.5} />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight text-tx">SMC SuperFIB</h1>
          <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.2em] text-mute">
            Trading Dashboard
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce" />
        </div>
      </div>
    </div>
  );
}

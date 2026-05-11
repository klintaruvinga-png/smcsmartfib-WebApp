import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { Activity } from "lucide-react";
import { hasCredentials, hasWordPressNonce } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: LandingLoader,
});

function LandingLoader() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => {
      const authed = hasCredentials() || hasWordPressNonce();
      router.navigate({ to: authed ? "/plan" : "/login" });
    }, 900);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="flex flex-col items-center gap-5">
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

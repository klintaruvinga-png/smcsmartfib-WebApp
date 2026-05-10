import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { fetchAdminHealth, type AdminHealthResponse, AuthError } from "@/lib/api/sniperClient";
import { hasCredentials, hasWordPressNonce } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Health - SMC SuperFIB" },
      {
        name: "description",
        content: "Admin-only backend health summary for the SMC SuperFIB dashboard.",
      },
    ],
  }),
  component: AdminPage,
});

type LoadState =
  | { kind: "loading" }
  | { kind: "denied" }
  | { kind: "ready"; health: AdminHealthResponse };

function AdminPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (!hasCredentials() && !hasWordPressNonce()) {
      void router.navigate({ to: "/login" });
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const health = await fetchAdminHealth();
        if (!cancelled) {
          setState({ kind: "ready", health });
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof AuthError) {
          void router.navigate({ to: "/login" });
          return;
        }
        setState({ kind: "denied" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state.kind === "loading") {
    return <div className="text-mute text-sm">Loading admin health...</div>;
  }

  if (state.kind === "denied") {
    return (
      <div className="max-w-2xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Admin Health</h1>
          <p className="mt-0.5 text-xs text-mute">Administrator capability required</p>
        </div>

        <div className="rounded-lg border border-sell/30 bg-sell/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-sell" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-sell">Access denied</div>
              <p className="text-xs text-dim">
                This route is restricted to WordPress administrators. No backend diagnostics were
                exposed.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { health } = state;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Admin Health</h1>
        <p className="mt-0.5 text-xs text-mute">
          Administrator-only backend status from <span className="font-mono">/sniper/v1/admin/health</span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <HealthCard
          label="System status"
          value={health.feedStatus ?? health.priceFeed}
          tone={toneForStatus(health.feedStatus ?? health.priceFeed)}
        />
        <HealthCard
          label="Backend sync"
          value={health.backendSync}
          tone={toneForStatus(health.backendSync)}
        />
        <HealthCard
          label="Engine run"
          value={health.engineRunState ?? "unknown"}
          tone={toneForStatus(health.engineRunState)}
        />
        <HealthCard
          label="Price feed"
          value={health.priceFeed}
          tone={toneForStatus(health.priceFeed)}
        />
        <HealthCard
          label="Twelve Data key"
          value={health.twelveDataKeyStatus ?? health.twelveDataKey}
          tone={toneForStatus(health.twelveDataKeyStatus ?? health.twelveDataKey)}
        />
        <HealthCard
          label="Per-symbol diagnostics"
          value={String(health.perSymbolDiagnostics?.length ?? 0)}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <TimestampCard label="Last batch" value={health.lastBatchAt} />
        <TimestampCard label="Last engine run" value={health.lastEngineRunAt} />
      </div>

      {health.perSymbolDiagnostics && health.perSymbolDiagnostics.length > 0 && (
        <div className="rounded-lg border border-bd bg-bg1/60 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" />
            <div className="text-[11px] font-mono uppercase tracking-wider text-mute">
              Per-symbol diagnostics
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-mute">
                <tr className="border-b border-bd">
                  <th className="px-2 py-2 font-mono uppercase tracking-wider">Symbol</th>
                  <th className="px-2 py-2 font-mono uppercase tracking-wider">Price</th>
                  <th className="px-2 py-2 font-mono uppercase tracking-wider">Candle</th>
                  <th className="px-2 py-2 font-mono uppercase tracking-wider">Blocker</th>
                </tr>
              </thead>
              <tbody>
                {health.perSymbolDiagnostics.map((diagnostic) => (
                  <tr key={diagnostic.symbol} className="border-b border-bd/50 last:border-b-0">
                    <td className="px-2 py-2 font-mono text-tx">{diagnostic.symbol}</td>
                    <td className="px-2 py-2 text-dim">{diagnostic.priceState}</td>
                    <td className="px-2 py-2 text-dim">{diagnostic.candleState}</td>
                    <td className="px-2 py-2 text-dim">{diagnostic.engineBlocker}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function HealthCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "warning" | "critical" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "border-buy/30 bg-buy/10 text-buy"
      : tone === "warning"
        ? "border-warn/30 bg-warn/10 text-warn"
        : tone === "critical"
          ? "border-sell/30 bg-sell/10 text-sell"
          : "border-bd bg-bg2/50 text-tx";

  return (
    <div className="rounded-lg border border-bd bg-bg1/60 p-4 space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-mute">{label}</div>
      <div className={`inline-flex rounded border px-2 py-1 font-mono text-sm uppercase ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function TimestampCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-bd bg-bg1/60 p-4 space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-mute">{label}</div>
      <div className="font-mono text-sm text-tx">{formatTimestamp(value)}</div>
    </div>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Unavailable";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString();
}

function toneForStatus(value: string | undefined): "positive" | "warning" | "critical" | "neutral" {
  switch (value) {
    case "live":
    case "present":
    case "ok":
      return "positive";
    case "cached":
    case "stale":
    case "missing":
    case "rate-limited":
      return "warning";
    case "blocked":
    case "offline":
    case "failed":
      return "critical";
    default:
      return "neutral";
  }
}

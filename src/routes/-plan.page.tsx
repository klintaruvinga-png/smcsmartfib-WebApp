import {
  useCanonicalWatchlist,
  useLiveSignals,
  useLadders,
  useSnapshot,
  usePollingUiState,
} from "@/hooks/useSniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { SettingsQueryErrorState } from "@/components/sniper/SettingsQueryErrorState";
import { DivergenceBanner } from "@/components/sniper/Warnings";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { deduplicateById } from "@/lib/utils";
import { WalletOverview } from "@/components/sniper/WalletOverview";
import { isTradePlanComplete } from "./-plan.utils";
import type { SignalCandidate, TradePlan } from "@/types/sniper";
import { PlanCandidateCard } from "@/components/PlanCard";

const VERDICT_RANK: Record<string, number> = { "A+": 4, A: 3, B: 2, C: 1 };

type RankedCandidate = {
  signal: SignalCandidate;
  plan: TradePlan | null;
  hasPlan: boolean;
  planComplete: boolean;
  originalIndex: number;
};

type RenderableCandidate = RankedCandidate & {
  plan: TradePlan;
  hasPlan: true;
};

function compareRankedCandidates(a: RankedCandidate, b: RankedCandidate) {
  const verdictDelta =
    (VERDICT_RANK[b.signal.verdict] ?? 0) - (VERDICT_RANK[a.signal.verdict] ?? 0);
  if (verdictDelta !== 0) return verdictDelta;

  if (a.signal.backendConfirmed !== b.signal.backendConfirmed) {
    return a.signal.backendConfirmed ? -1 : 1;
  }

  const aReady = a.signal.status === "READY";
  const bReady = b.signal.status === "READY";
  if (aReady !== bReady) return aReady ? -1 : 1;

  if (a.hasPlan !== b.hasPlan) return a.hasPlan ? -1 : 1;

  return a.originalIndex - b.originalIndex;
}

function hasRenderablePlan(candidate: RankedCandidate): candidate is RenderableCandidate {
  return candidate.hasPlan && candidate.plan !== null;
}

export function PlanPage() {
  const { data: signals, isLoading: signalsLoading } = useLiveSignals();
  const {
    data: ladders,
    isLoading: laddersLoading,
    isError: laddersIsError,
    error: laddersError,
  } = useLadders();
  const { data: snapshot } = useSnapshot();
  const {
    pendingSettingsLoad,
    missingBackendUrl,
    settingsLoadFailed,
    settingsLoadError,
    retrySettingsLoad,
  } = usePollingUiState();
  const { watchlist, watchlistSet } = useCanonicalWatchlist();

  const uniqueSignals = signals
    ? deduplicateById(signals).sort(
        (a, b) => (VERDICT_RANK[b.verdict] ?? 0) - (VERDICT_RANK[a.verdict] ?? 0),
      )
    : [];

  const laddersBySignalId = new Map((ladders ?? []).map((ladder) => [ladder.signalId, ladder]));
  const candidatePool: RankedCandidate[] = uniqueSignals.map((signal, originalIndex) => {
    const candidatePlan = laddersBySignalId.get(signal.id) ?? null;
    return {
      signal,
      plan: candidatePlan,
      hasPlan: candidatePlan !== null,
      planComplete: Boolean(candidatePlan && isTradePlanComplete(candidatePlan)),
      originalIndex,
    };
  });

  const watchlistCandidates = candidatePool.filter(({ signal }) => watchlistSet.has(signal.symbol));
  const rankedWatchlistCandidates = [...watchlistCandidates].sort(compareRankedCandidates);
  // Show all ranked candidates — cards render in "awaiting blueprint" state when no plan exists
  const topCandidates = rankedWatchlistCandidates.slice(0, 3);
  const divergentCount = topCandidates.filter(
    ({ signal }) => signal.computedBy === "frontend" && !signal.backendConfirmed,
  ).length;
  const firstWatchlistCandidate = rankedWatchlistCandidates[0];

  if (pendingSettingsLoad || signalsLoading || laddersLoading) {
    return (
      <div className="flex items-center gap-2 text-mute text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading signal data and blueprints...
      </div>
    );
  }

  if (settingsLoadFailed) {
    return (
      <SettingsQueryErrorState
        resourceLabel="signal plans"
        errorDetail={settingsLoadError}
        onRetry={retrySettingsLoad}
      />
    );
  }

  if (missingBackendUrl) {
    return (
      <div className="text-mute text-sm">
        Configure a backend URL in Account before loading signal plans.
      </div>
    );
  }

  if (topCandidates.length === 0) {
    const watchlistCandidateIds = watchlistCandidates.map(({ signal }) => signal.id);
    const blueprintIds = ladders?.map((ladder) => ladder.signalId) ?? [];
    const matchedWatchlistBlueprintCount = watchlistCandidateIds.filter((signalId) =>
      laddersBySignalId.has(signalId),
    ).length;
    const diagnostics = {
      signalCount: uniqueSignals.length,
      watchlistCount: watchlist.length,
      watchlistCandidateCount: watchlistCandidates.length,
      blueprintCount: ladders?.length ?? 0,
      matchedWatchlistBlueprintCount,
    };

    return (
      <div className="space-y-5">
          <WalletOverview />
          {laddersIsError && (
            <div className="rounded-lg border border-warn/30 bg-warn/5 p-3 text-sm">
              <div className="flex items-center gap-2 text-warn">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>/ladders: backend response missing ladder array</div>
              </div>
              {laddersError instanceof Error && (
                <div className="text-xs text-mute mt-2">{laddersError.message}</div>
              )}
            </div>
          )}
          <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-mute">
            <AlertTriangle className="h-4 w-4 text-warn shrink-0" />
            {watchlist.length === 0
              ? "No watchlist symbols configured for signal plans."
              : firstWatchlistCandidate
                ? "No matching blueprint for current watchlist candidates."
                : "No active watchlist candidates found."}
          </div>
          <div className="text-xs text-dim bg-bg1/40 rounded px-3 py-2 max-w-xl space-y-1">
            <div>Signals loaded: {diagnostics.signalCount}</div>
            <div>Watchlist symbols: {diagnostics.watchlistCount}</div>
            <div>Watchlist candidates: {diagnostics.watchlistCandidateCount}</div>
            <div>Found {diagnostics.blueprintCount} total blueprints</div>
            {diagnostics.blueprintCount === 0 && (
              <div className="flex items-center gap-1.5 text-warn">
                <Search className="h-3.5 w-3.5 shrink-0" />
                Ladders endpoint returned no data - check backend connectivity
              </div>
            )}
            {diagnostics.blueprintCount > 0 &&
              diagnostics.watchlistCandidateCount > 0 &&
              diagnostics.matchedWatchlistBlueprintCount === 0 && (
                <div className="flex items-center gap-1.5 text-warn">
                  <Search className="h-3.5 w-3.5 shrink-0" />
                  No ladder signal IDs match current watchlist candidates
                </div>
              )}
          </div>
          {watchlistCandidates.length > 0 && (
            <div className="space-y-1.5 max-w-xl">
              <div className="text-xs font-medium text-mute uppercase tracking-wide">
                Candidate gate status
              </div>
              {watchlistCandidates.map(({ signal }) => {
                const blocker = signal.engineBlocker ?? "UNKNOWN";
                const isReady = signal.status === "READY";
                const isBlocked = !isReady || blocker !== "OK";
                return (
                  <div
                    key={signal.id}
                    className="text-xs bg-bg1/40 rounded px-3 py-2 flex items-start gap-2"
                  >
                    <AlertTriangle
                      className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${isBlocked ? "text-warn" : "text-ok"}`}
                    />
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-info">{signal.symbol}</span>
                        <span className="text-mute">{signal.direction}</span>
                        <span
                          className={`font-mono font-semibold ${isReady ? "text-ok" : "text-warn"}`}
                        >
                          {signal.status}
                        </span>
                        {signal.backendConfirmed && (
                          <span className="text-ok">backend-confirmed</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap text-dim">
                        <span>blocker:</span>
                        <span
                          className={`font-mono ${blocker === "OK" ? "text-ok" : "text-warn"}`}
                        >
                          {blocker}
                        </span>
                        <span className="text-dim/50">·</span>
                        <span className="font-mono truncate max-w-[18ch]">{signal.id}</span>
                      </div>
                      {signal.engine && (
                        <div className="text-dim flex gap-2 flex-wrap">
                          <span>htf: {signal.engine.htfBias}</span>
                          <span>·</span>
                          <span>pd: {signal.engine.pdState}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <WalletOverview />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Signal Plans</h1>
          <p className="text-xs text-mute mt-0.5">
            Top {topCandidates.length} watchlist candidate{topCandidates.length > 1 ? "s" : ""} by
            verdict
          </p>
        </div>
        <FreshnessBadge state={divergentCount > 0 ? "pending-sync" : "live"} />
      </div>

      {divergentCount > 0 && (
        <DivergenceBanner>
          {divergentCount} candidate{divergentCount > 1 ? "s are" : " is"} frontend computed and
          waiting on backend confirmation. Do not execute until the backend confirms the blueprint.
        </DivergenceBanner>
      )}

      <div className="space-y-4">
        {topCandidates.map((candidate) => (
          <PlanCandidateCard
            key={candidate.signal.id}
            signal={candidate.signal}
            plan={candidate.plan}
            price={snapshot?.prices.find((entry) => entry.symbol === candidate.signal.symbol)}
            planComplete={candidate.planComplete}
          />
        ))}
      </div>
    </div>
  );
}

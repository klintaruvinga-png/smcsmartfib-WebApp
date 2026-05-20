import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { apiClient, normalizeBackendUrl, setBackendUrl } from "@/lib/api/sniperClient";
import type { DashboardSettings, Symbol, SymbolDiagnostic, TradePlan } from "@/types/sniper";

const DEFAULT_POLL_MS = 2_000;
const WATCHLIST_LIMIT = 24;

export type PollingUiState = {
  backendReady: boolean;
  pendingSettingsLoad: boolean;
  missingBackendUrl: boolean;
  settingsLoadFailed: boolean;
  settingsLoadError: string | null;
  pollMs: number | null;
  retrySettingsLoad: () => Promise<unknown>;
};

export function useBackendReady() {
  return usePollingQueryState().backendReady;
}

export function usePollMs() {
  return usePollingQueryState().pollMs;
}

function resolvePollMs(settings: DashboardSettings | undefined): number | null {
  const sec = settings?.refreshIntervalSec;
  // CRITICAL FIX: Only use loaded user settings, never fall back to DEFAULT
  // before the settings query has resolved.
  if (!settings) return null;
  return Number.isFinite(sec) && (sec ?? 0) > 0 ? (sec as number) * 1000 : DEFAULT_POLL_MS;
}

function usePollingQueryState() {
  const settingsQuery = useUserSettings();
  const settings = settingsQuery.data;
  const pendingSettingsLoad =
    settings === undefined &&
    (settingsQuery.fetchStatus === "fetching" ||
      settingsQuery.isPending === true ||
      settingsQuery.isLoading === true);
  const settingsLoadFailed =
    settings === undefined && (settingsQuery.isError === true || settingsQuery.status === "error");
  const pollMs = pendingSettingsLoad ? null : resolvePollMs(settings);
  const backendUrl = normalizeBackendUrl(settings?.backendUrl);
  const backendReady = backendUrl.length > 0;
  const missingBackendUrl = !pendingSettingsLoad && !settingsLoadFailed && backendUrl.length === 0;
  const settingsLoadError =
    settingsLoadFailed && settingsQuery.error instanceof Error ? settingsQuery.error.message : null;

  return {
    backendReady,
    pendingSettingsLoad,
    missingBackendUrl,
    settingsLoadFailed,
    settingsLoadError,
    pollMs,
    retrySettingsLoad: settingsQuery.refetch,
  };
}

export function usePollingUiState(): PollingUiState {
  return usePollingQueryState();
}

function useLivePollingDiagnostics(
  label: string,
  backendReady: boolean,
  pendingSettingsLoad: boolean,
  pollMs: number | null,
) {
  const previousPollMsRef = useRef<number | null>(pollMs);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      previousPollMsRef.current = pollMs;
      return;
    }

    if (
      previousPollMsRef.current === null &&
      pollMs !== null &&
      backendReady &&
      !pendingSettingsLoad
    ) {
      console.warn(`[${label}] poll re-enabled after settings resolved`, {
        backendReady,
        pollMs,
      });
    }

    previousPollMsRef.current = pollMs;
  }, [backendReady, label, pendingSettingsLoad, pollMs]);
}

export function useSnapshot() {
  const { backendReady, pendingSettingsLoad, pollMs } = usePollingQueryState();
  // CRITICAL: Only enable query when backend is ready AND pollMs is valid (not null).
  // Prevents orphaned queries and race conditions during initialization.
  const enabled = backendReady && pollMs !== null;
  useLivePollingDiagnostics("SNAPSHOT_POLL", backendReady, pendingSettingsLoad, pollMs);
  return useQuery({
    queryKey: ["snapshot"],
    queryFn: () => apiClient.getSnapshot(),
    enabled,
    refetchOnWindowFocus: false,
    refetchInterval: enabled ? pollMs : false,
  });
}

export function useLiveSignals() {
  const { backendReady, pollMs } = usePollingQueryState();
  // CRITICAL: Only enable query when backend is ready AND pollMs is valid (not null).
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["live-signals"],
    queryFn: () => apiClient.getLiveSignals(),
    enabled,
    refetchOnWindowFocus: false,
    refetchInterval: enabled ? pollMs : false,
  });
}

export function useUserTrades() {
  const { backendReady, pollMs } = usePollingQueryState();
  // CRITICAL: Only enable query when backend is ready AND pollMs is valid (not null).
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["user-trades"],
    queryFn: () => apiClient.getUserTrades(),
    enabled,
    refetchInterval: enabled ? pollMs : false,
  });
}

export function useUserAccount() {
  const { backendReady, pollMs } = usePollingQueryState();
  // CRITICAL: Only enable query when backend is ready AND pollMs is valid (not null).
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["user-account"],
    queryFn: () => apiClient.getUserAccount(),
    enabled,
    refetchInterval: enabled ? pollMs : false,
  });
}

export function useAccountTelemetry() {
  const { backendReady, pollMs } = usePollingQueryState();
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["account-telemetry"],
    queryFn: () => apiClient.getAccountTelemetry(),
    enabled,
    refetchInterval: enabled ? pollMs : false,
  });
}

export function useUserSettings() {
  return useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      const s = normalizeDashboardSettings(await apiClient.getUserSettings());
      setBackendUrl(s.backendUrl);
      return s;
    },
    staleTime: 30_000,
  });
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => apiClient.getSession(),
    refetchInterval: 60_000, // Session changes infrequently
  });
}

/** Canonical watchlist derived from the user-settings cache - single source of truth. */
function normalizeWatchlist(watchlist: readonly Symbol[] | undefined | null): Symbol[] {
  const canonical: Symbol[] = [];
  for (const symbol of watchlist ?? []) {
    if (typeof symbol !== "string") continue;
    const normalized = symbol.trim().toUpperCase() as Symbol;
    if (!normalized || canonical.includes(normalized)) continue;
    canonical.push(normalized);
    if (canonical.length === WATCHLIST_LIMIT) break;
  }
  return canonical;
}

function normalizeDashboardSettings(settings: DashboardSettings): DashboardSettings {
  return {
    ...settings,
    backendUrl: normalizeBackendUrl(settings.backendUrl),
    watchlist: normalizeWatchlist(settings.watchlist),
  };
}

export function clampSymbolToWatchlist(
  symbol: Symbol | null | undefined,
  watchlist: readonly Symbol[],
): Symbol | null {
  if (symbol && watchlist.includes(symbol)) {
    return symbol;
  }
  return watchlist[0] ?? null;
}

export function filterItemsByWatchlist<T extends { symbol: string }>(
  items: readonly T[] | undefined | null,
  watchlist: readonly Symbol[],
): T[] {
  const itemsBySymbol = new Map<string, T>();
  for (const item of items ?? []) {
    if (!itemsBySymbol.has(item.symbol)) {
      itemsBySymbol.set(item.symbol, item);
    }
  }

  const ordered: T[] = [];
  for (const symbol of watchlist) {
    const item = itemsBySymbol.get(symbol);
    if (item) {
      ordered.push(item);
    }
  }
  return ordered;
}

/**
 * Align the canonical watchlist with backend items. Returns an entry per watchlist
 * symbol - `item` is undefined when the backend snapshot has not yet emitted data
 * for that symbol. This keeps newly-added symbols visible (as "awaiting data")
 * instead of disappearing on the next sparse snapshot.
 */
export function alignWatchlistItems<T extends { symbol: string }>(
  items: readonly T[] | undefined | null,
  watchlist: readonly Symbol[],
): { symbol: Symbol; item: T | undefined }[] {
  const itemsBySymbol = new Map<string, T>();
  for (const item of items ?? []) {
    if (!itemsBySymbol.has(item.symbol)) itemsBySymbol.set(item.symbol, item);
  }
  return watchlist.map((symbol) => ({ symbol, item: itemsBySymbol.get(symbol) }));
}

export function useWatchlist() {
  const { data } = useUserSettings();
  return useMemo(() => normalizeWatchlist(data?.watchlist), [data?.watchlist]);
}

export function useCanonicalWatchlist() {
  const watchlist = useWatchlist();
  const watchlistSet = useMemo(() => new Set<Symbol>(watchlist), [watchlist]);
  return { watchlist, watchlistSet };
}

type WatchlistMutationContext = {
  previousSettings?: DashboardSettings;
};

async function cancelWatchlistQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: ["user-settings"] }),
    queryClient.cancelQueries({ queryKey: ["snapshot"] }),
    queryClient.cancelQueries({ queryKey: ["live-signals"] }),
    queryClient.cancelQueries({ queryKey: ["ladders"] }),
    queryClient.cancelQueries({ queryKey: ["engine-health"] }),
    queryClient.cancelQueries({ queryKey: ["chart"] }),
  ]);
}

async function invalidateWatchlistQueries(queryClient: ReturnType<typeof useQueryClient>) {
  // NOTE: do NOT invalidate/refetch ["user-settings"] here. The watchlist
  // mutation response is the canonical source of truth for the watchlist; the
  // backend GET /user/settings can lag the mutation by one cycle and would
  // otherwise overwrite the freshly-added/removed symbol, causing the Account
  // chip to flicker off and back on.
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["snapshot"], refetchType: "none" }),
    queryClient.invalidateQueries({ queryKey: ["live-signals"], refetchType: "none" }),
    queryClient.invalidateQueries({ queryKey: ["ladders"], refetchType: "none" }),
    queryClient.invalidateQueries({ queryKey: ["engine-health"], refetchType: "none" }),
    queryClient.invalidateQueries({ queryKey: ["chart"], refetchType: "none" }),
  ]);
  await Promise.all([
    queryClient.refetchQueries({ queryKey: ["snapshot"], type: "active" }),
    queryClient.refetchQueries({ queryKey: ["live-signals"], type: "active" }),
    queryClient.refetchQueries({ queryKey: ["ladders"], type: "active" }),
    queryClient.refetchQueries({ queryKey: ["engine-health"], type: "active" }),
    queryClient.refetchQueries({ queryKey: ["chart"], type: "active" }),
  ]);
}

function writeCanonicalWatchlist(
  queryClient: ReturnType<typeof useQueryClient>,
  watchlist: readonly Symbol[],
) {
  const canonicalWatchlist = normalizeWatchlist(watchlist);
  queryClient.setQueryData<DashboardSettings>(["user-settings"], (old) =>
    old ? { ...old, watchlist: canonicalWatchlist } : old,
  );
}

export function useWatchlistAdd() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean; watchlist: Symbol[] }, Error, string, WatchlistMutationContext>(
    {
      mutationFn: (symbol: string) => apiClient.postWatchlistAdd(symbol),
      onMutate: async (symbol: string) => {
        await cancelWatchlistQueries(queryClient);
        const previousSettings = queryClient.getQueryData<DashboardSettings>(["user-settings"]);
        queryClient.setQueryData<DashboardSettings>(["user-settings"], (old) => {
          if (!old) return old;
          const nextSymbol = symbol as Symbol;
          if (old.watchlist.includes(nextSymbol)) return old;
          return { ...old, watchlist: normalizeWatchlist([...old.watchlist, nextSymbol]) };
        });
        return { previousSettings };
      },
      onSuccess: async (result) => {
        writeCanonicalWatchlist(queryClient, result.watchlist);
        await invalidateWatchlistQueries(queryClient);
      },
      onError: (_error, _symbol, context) => {
        if (context?.previousSettings) {
          queryClient.setQueryData(["user-settings"], context.previousSettings);
        }
      },
    },
  );
}

export function useWatchlistRemove() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean; watchlist: Symbol[] }, Error, string, WatchlistMutationContext>(
    {
      mutationFn: (symbol: string) => apiClient.postWatchlistRemove(symbol),
      onMutate: async (symbol: string) => {
        await cancelWatchlistQueries(queryClient);
        const previousSettings = queryClient.getQueryData<DashboardSettings>(["user-settings"]);
        queryClient.setQueryData<DashboardSettings>(["user-settings"], (old) => {
          if (!old) return old;
          return {
            ...old,
            watchlist: normalizeWatchlist(
              old.watchlist.filter((entry) => entry !== (symbol as Symbol)),
            ),
          };
        });
        return { previousSettings };
      },
      onSuccess: async (result) => {
        writeCanonicalWatchlist(queryClient, result.watchlist);
        await invalidateWatchlistQueries(queryClient);
      },
      onError: (_error, _symbol, context) => {
        if (context?.previousSettings) {
          queryClient.setQueryData(["user-settings"], context.previousSettings);
        }
      },
    },
  );
}

export function useEngineHealth() {
  const { backendReady, pollMs } = usePollingQueryState();
  // CRITICAL: Only enable query when backend is ready AND pollMs is valid (not null).
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["engine-health"],
    queryFn: () => apiClient.getEngineHealth(),
    enabled,
    // Phase 0: health query must reflect backend state within one poll cycle; disable caching.
    staleTime: 0,
    refetchInterval: enabled ? pollMs : false,
  });
}

export function useUserRiskProfile() {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: ["user-risk"],
    queryFn: () => apiClient.getUserRiskProfile(),
    enabled: backendReady,
  });
}

export function useLadders() {
  const { backendReady, pollMs } = usePollingQueryState();
  const enabled = backendReady && pollMs !== null;
  return useQuery<TradePlan[]>({
    queryKey: ["ladders"],
    queryFn: () => apiClient.getLadders(),
    enabled,
    refetchInterval: enabled ? pollMs : false,
  });
}

/** Trigger a forced backend market-data refresh + engine run, then invalidate all dependent queries. */
export function useEngineBatch() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean; diagnostics: SymbolDiagnostic[] }, Error, Symbol[] | undefined>(
    {
      mutationFn: (symbols) => apiClient.postEngineBatch(symbols),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["snapshot"] });
        queryClient.invalidateQueries({ queryKey: ["live-signals"] });
        queryClient.invalidateQueries({ queryKey: ["engine-health"] });
        queryClient.invalidateQueries({ queryKey: ["ladders"] });
        queryClient.invalidateQueries({ queryKey: ["chart"] });
      },
    },
  );
}

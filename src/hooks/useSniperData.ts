import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, setBackendUrl } from "@/lib/api/sniperClient";
import type { DashboardSettings, Symbol, SymbolDiagnostic, TradePlan } from "@/types/sniper";

const DEFAULT_POLL_MS = 2_000;
const WATCHLIST_LIMIT = 24;

export function useBackendReady() {
  const { data } = useUserSettings();
  return Boolean(data?.backendUrl);
}

export function usePollMs() {
  const { data } = useUserSettings();
  const sec = data?.refreshIntervalSec;
  // CRITICAL FIX: Only use loaded user settings, never fall back to DEFAULT.
  // If settings haven't loaded yet, return null to disable polling until ready.
  // This prevents orphaned queries firing with stale refresh intervals.
  if (!data) return null;
  return Number.isFinite(sec) && (sec ?? 0) > 0 ? (sec as number) * 1000 : DEFAULT_POLL_MS;
}

export function useSnapshot() {
  const backendReady = useBackendReady();
  const pollMs = usePollMs();
  // CRITICAL: Only enable query when backend is ready AND pollMs is valid (not null).
  // Prevents orphaned queries and race conditions during initialization.
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["snapshot"],
    queryFn: () => apiClient.getSnapshot(),
    enabled,
    refetchInterval: pollMs ?? DEFAULT_POLL_MS, // Use DEFAULT_POLL_MS when pollMs is null
  });
}

export function useLiveSignals() {
  const backendReady = useBackendReady();
  const pollMs = usePollMs();
  // CRITICAL: Only enable query when backend is ready AND pollMs is valid (not null).
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["live-signals"],
    queryFn: () => apiClient.getLiveSignals(),
    enabled,
    refetchInterval: pollMs ?? DEFAULT_POLL_MS,
  });
}

export function useUserTrades() {
  const backendReady = useBackendReady();
  const pollMs = usePollMs();
  // CRITICAL: Only enable query when backend is ready AND pollMs is valid (not null).
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["user-trades"],
    queryFn: () => apiClient.getUserTrades(),
    enabled,
    refetchInterval: pollMs ?? DEFAULT_POLL_MS,
  });
}

export function useUserAccount() {
  const backendReady = useBackendReady();
  const pollMs = usePollMs();
  // CRITICAL: Only enable query when backend is ready AND pollMs is valid (not null).
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["user-account"],
    queryFn: () => apiClient.getUserAccount(),
    enabled,
    refetchInterval: pollMs ?? DEFAULT_POLL_MS,
  });
}

export function useUserSettings() {
  return useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      const s = await apiClient.getUserSettings();
      if (s.backendUrl) setBackendUrl(s.backendUrl);
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

/** Canonical watchlist derived from the user-settings cache — single source of truth. */
function normalizeWatchlist(watchlist: readonly Symbol[] | undefined | null): Symbol[] {
  const canonical: Symbol[] = [];
  for (const symbol of watchlist ?? []) {
    if (typeof symbol !== "string") continue;
    const normalized = symbol.trim() as Symbol;
    if (!normalized || canonical.includes(normalized)) continue;
    canonical.push(normalized);
    if (canonical.length === WATCHLIST_LIMIT) break;
  }
  return canonical;
}

export function useWatchlist() {
  const { data } = useUserSettings();
  return normalizeWatchlist(data?.watchlist);
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
  const backendReady = useBackendReady();
  const pollMs = usePollMs();
  // CRITICAL: Only enable query when backend is ready AND pollMs is valid (not null).
  const enabled = backendReady && pollMs !== null;
  return useQuery({
    queryKey: ["engine-health"],
    queryFn: () => apiClient.getEngineHealth(),
    enabled,
    refetchInterval: pollMs ?? DEFAULT_POLL_MS,
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
  const backendReady = useBackendReady();
  const pollMs = usePollMs();
  const enabled = backendReady && pollMs !== null;
  return useQuery<TradePlan[]>({
    queryKey: ["ladders"],
    queryFn: () => apiClient.getLadders(),
    enabled,
    refetchInterval: pollMs ?? DEFAULT_POLL_MS,
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

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, setBackendUrl } from "@/lib/api/sniperClient";
import type { Symbol, SymbolDiagnostic, TradePlan } from "@/types/sniper";

const DEFAULT_POLL_MS = 15_000;

function useBackendReady() {
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
export function useWatchlist() {
  const { data } = useUserSettings();
  return data?.watchlist ?? [];
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
      },
    },
  );
}

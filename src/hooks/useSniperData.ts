import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, setBackendUrl } from "@/lib/api/sniperClient";
import type { Symbol } from "@/types/sniper";

const DEFAULT_POLL_MS = 15_000;

export function usePollMs() {
  const { data } = useUserSettings();
  const sec = data?.refreshIntervalSec;
  return Number.isFinite(sec) && (sec ?? 0) > 0 ? (sec as number) * 1000 : DEFAULT_POLL_MS;
}

export function useSnapshot() {
  const pollMs = usePollMs();
  return useQuery({
    queryKey: ["snapshot"],
    queryFn: () => apiClient.getSnapshot(),
    refetchInterval: pollMs,
  });
}

export function useLiveSignals() {
  const pollMs = usePollMs();
  return useQuery({
    queryKey: ["live-signals"],
    queryFn: () => apiClient.getLiveSignals(),
    refetchInterval: pollMs,
  });
}

export function useUserTrades() {
  const pollMs = usePollMs();
  return useQuery({
    queryKey: ["user-trades"],
    queryFn: () => apiClient.getUserTrades(),
    refetchInterval: pollMs,
  });
}

export function useUserAccount() {
  const pollMs = usePollMs();
  return useQuery({
    queryKey: ["user-account"],
    queryFn: () => apiClient.getUserAccount(),
    refetchInterval: pollMs,
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

/** Canonical watchlist derived from the user-settings cache — single source of truth. */
export function useWatchlist() {
  const { data } = useUserSettings();
  return data?.watchlist ?? [];
}

export function useEngineHealth() {
  const pollMs = usePollMs();
  return useQuery({
    queryKey: ["engine-health"],
    queryFn: () => apiClient.getEngineHealth(),
    refetchInterval: pollMs,
  });
}

export function useUserRiskProfile() {
  return useQuery({
    queryKey: ["user-risk"],
    queryFn: () => apiClient.getUserRiskProfile(),
  });
}

export function useLadders() {
  const pollMs = usePollMs();
  return useQuery({
    queryKey: ["ladders"],
    queryFn: () => apiClient.getLadders(),
    refetchInterval: pollMs,
  });
}

/** Trigger a forced backend market-data refresh + engine run, then invalidate all dependent queries. */
export function useEngineBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (symbols?: Symbol[]) => apiClient.postEngineBatch(symbols),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["live-signals"] });
      queryClient.invalidateQueries({ queryKey: ["engine-health"] });
      queryClient.invalidateQueries({ queryKey: ["ladders"] });
    },
  });
}


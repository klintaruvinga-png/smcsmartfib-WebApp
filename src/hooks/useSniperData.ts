import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, setBackendUrl } from "@/lib/api/sniperClient";
import type { Symbol } from "@/types/sniper";

const DEFAULT_POLL_MS = 15_000;

function useBackendReady() {
  const { data } = useUserSettings();
  return Boolean(data?.backendUrl);
}

export function usePollMs() {
  const { data } = useUserSettings();
  const sec = data?.refreshIntervalSec;
  return Number.isFinite(sec) && (sec ?? 0) > 0 ? (sec as number) * 1000 : DEFAULT_POLL_MS;
}

export function useSnapshot() {
  const backendReady = useBackendReady();
  const pollMs = usePollMs();
  return useQuery({
    queryKey: ["snapshot"],
    queryFn: () => apiClient.getSnapshot(),
    enabled: backendReady,
    refetchInterval: pollMs,
  });
}

export function useLiveSignals() {
  const backendReady = useBackendReady();
  const pollMs = usePollMs();
  return useQuery({
    queryKey: ["live-signals"],
    queryFn: () => apiClient.getLiveSignals(),
    enabled: backendReady,
    refetchInterval: pollMs,
  });
}

export function useUserTrades() {
  const backendReady = useBackendReady();
  const pollMs = usePollMs();
  return useQuery({
    queryKey: ["user-trades"],
    queryFn: () => apiClient.getUserTrades(),
    enabled: backendReady,
    refetchInterval: pollMs,
  });
}

export function useUserAccount() {
  const backendReady = useBackendReady();
  const pollMs = usePollMs();
  return useQuery({
    queryKey: ["user-account"],
    queryFn: () => apiClient.getUserAccount(),
    enabled: backendReady,
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
  return useQuery({
    queryKey: ["engine-health"],
    queryFn: () => apiClient.getEngineHealth(),
    enabled: backendReady,
    refetchInterval: pollMs,
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
  return useQuery({
    queryKey: ["ladders"],
    queryFn: () => apiClient.getLadders(),
    enabled: backendReady,
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


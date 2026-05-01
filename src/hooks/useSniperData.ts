import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/sniperClient";

const DEFAULT_POLL_MS = 15_000;

function usePollMs() {
  const { data } = useUserSettings();
  const sec = data?.refreshIntervalSec;
  return Number.isFinite(sec) && (sec ?? 0) > 0 ? (sec as number) * 1000 : DEFAULT_POLL_MS;
}

export function useSnapshot() {
  return useQuery({
    queryKey: ["snapshot"],
    queryFn: () => apiClient.getSnapshot(),
    refetchInterval: usePollMs(),
  });
}

export function useLiveSignals() {
  return useQuery({
    queryKey: ["live-signals"],
    queryFn: () => apiClient.getLiveSignals(),
    refetchInterval: usePollMs(),
  });
}

export function useUserTrades() {
  return useQuery({
    queryKey: ["user-trades"],
    queryFn: () => apiClient.getUserTrades(),
    refetchInterval: usePollMs(),
  });
}

export function useUserAccount() {
  return useQuery({
    queryKey: ["user-account"],
    queryFn: () => apiClient.getUserAccount(),
    refetchInterval: usePollMs(),
  });
}

export function useUserSettings() {
  return useQuery({
    queryKey: ["user-settings"],
    queryFn: () => apiClient.getUserSettings(),
  });
}

/** Canonical watchlist derived from the user-settings cache — single source of truth. */
export function useWatchlist() {
  const { data } = useUserSettings();
  return data?.watchlist ?? [];
}

export function useEngineHealth() {
  return useQuery({
    queryKey: ["engine-health"],
    queryFn: () => apiClient.getEngineHealth(),
    refetchInterval: usePollMs(),
  });
}

export function useUserRiskProfile() {
  return useQuery({
    queryKey: ["user-risk"],
    queryFn: () => apiClient.getUserRiskProfile(),
  });
}

export function useLadders() {
  return useQuery({
    queryKey: ["ladders"],
    queryFn: () => apiClient.getLadders(),
  });
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => apiClient.getSession(),
    refetchInterval: Math.max(usePollMs(), 60_000),
  });
}

export function useRegimes() {
  return useQuery({
    queryKey: ["regimes"],
    queryFn: () => apiClient.getRegimes(),
    refetchInterval: usePollMs(),
  });
}

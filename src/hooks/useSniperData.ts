import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/sniperClient";

const POLL_MS = 15_000;

export function useSnapshot() {
  return useQuery({
    queryKey: ["snapshot"],
    queryFn: () => apiClient.getSnapshot(),
    refetchInterval: POLL_MS,
  });
}

export function useLiveSignals() {
  return useQuery({
    queryKey: ["live-signals"],
    queryFn: () => apiClient.getLiveSignals(),
    refetchInterval: POLL_MS,
  });
}

export function useUserTrades() {
  return useQuery({
    queryKey: ["user-trades"],
    queryFn: () => apiClient.getUserTrades(),
    refetchInterval: POLL_MS,
  });
}

export function useUserAccount() {
  return useQuery({
    queryKey: ["user-account"],
    queryFn: () => apiClient.getUserAccount(),
    refetchInterval: POLL_MS,
  });
}

export function useUserSettings() {
  return useQuery({
    queryKey: ["user-settings"],
    queryFn: () => apiClient.getUserSettings(),
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

/**
 * SMC-06.1 journal TanStack Query hooks.
 * Mirrors useSniperData conventions: useQuery + useMutation, queryClient invalidation.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { journalClient, type TradeStatus } from "@/lib/api/journalClient";

export function useTrades(status?: TradeStatus) {
  return useQuery({
    queryKey: ["journal", "trades", status ?? "all"],
    queryFn: () => journalClient.listTrades(status),
  });
}

export function useAddTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: journalClient.addTrade,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal", "trades"] });
    },
  });
}

export function useUpdateTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: Parameters<typeof journalClient.updateTrade>[0]) =>
      journalClient.updateTrade(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal", "trades"] });
    },
  });
}

export function useDeleteTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => journalClient.deleteTrade(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal", "trades"] });
    },
  });
}

export function useRiskLimits() {
  return useQuery({
    queryKey: ["journal", "risk"],
    queryFn: () => journalClient.getRiskLimits(),
  });
}

export function useSetRiskLimits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: journalClient.setRiskLimits,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal", "risk"] });
    },
  });
}

export function useEvaluateTrade() {
  return useMutation({
    mutationFn: journalClient.evaluateTrade,
  });
}

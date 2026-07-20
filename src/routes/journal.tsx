import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Shield, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useTrades,
  useAddTrade,
  useDeleteTrade,
  useRiskLimits,
  useSetRiskLimits,
  useEvaluateTrade,
} from "@/hooks/useJournal";
import type { TradeDirection, TradeStatus } from "@/lib/api/journalClient";

export const Route = createFileRoute("/journal")({
  head: () => ({
    meta: [
      { title: "Trade Journal - SMC SuperFIB" },
      { name: "description", content: "Trade journal and risk-limit workflow." },
    ],
  }),
  component: JournalPage,
});

function JournalPage() {
  const { data: trades, isLoading, isError, error } = useTrades();
  const addTrade = useAddTrade();
  const deleteTrade = useDeleteTrade();
  const { data: limits } = useRiskLimits();
  const setLimits = useSetRiskLimits();
  const evaluate = useEvaluateTrade();

  const [symbol, setSymbol] = useState("XAUUSD");
  const [direction, setDirection] = useState<TradeDirection>("long");
  const [lotSize, setLotSize] = useState("0.5");
  const [entryPrice, setEntryPrice] = useState("");

  const [limitDaily, setLimitDaily] = useState("");
  const [limitPositions, setLimitPositions] = useState("");
  const [limitSize, setLimitSize] = useState("");
  const [limitExposure, setLimitExposure] = useState("");

  const onAdd = async () => {
    if (!symbol.trim()) {
      toast.error("Symbol required");
      return;
    }
    try {
      await addTrade.mutateAsync({
        symbol: symbol.trim().toUpperCase(),
        direction,
        lotSize: Number(lotSize),
        entryPrice: entryPrice ? Number(entryPrice) : 0,
      });
      toast.success("Trade added to journal");
      setEntryPrice("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add trade");
    }
  };

  const onDelete = async (id: number) => {
    try {
      await deleteTrade.mutateAsync(id);
      toast.success("Trade removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const onEvaluate = async () => {
    try {
      const res = await evaluate.mutateAsync({
        symbol: symbol.trim().toUpperCase() || "XAUUSD",
        direction,
        lotSize: Number(lotSize),
      });
      if (res.allowed) toast.success("Pre-trade gate: ALLOWED");
      else toast.warning(`Gate blocked: ${res.reasons.join("; ")}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Evaluation failed");
    }
  };

  const onSaveLimits = async () => {
    try {
      await setLimits.mutateAsync({
        dailyLossLimit: limitDaily ? Number(limitDaily) : undefined,
        maxOpenPositions: limitPositions ? Number(limitPositions) : undefined,
        maxPositionSize: limitSize ? Number(limitSize) : undefined,
        maxPerSymbolExposure: limitExposure ? Number(limitExposure) : undefined,
      });
      toast.success("Risk limits saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save limits");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Trade Journal</h1>
        <p className="text-xs text-muted mt-0.5">
          Record-keeping and pre-trade risk gate. This system never places trades.
        </p>
      </div>

      {/* Add trade + gate */}
      <section className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="text-sm font-medium">Add Trade</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <input
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="Symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          />
          <select
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={direction}
            onChange={(e) => setDirection(e.target.value as TradeDirection)}
          >
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
          <input
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="Lot"
            type="number"
            step="0.01"
            value={lotSize}
            onChange={(e) => setLotSize(e.target.value)}
          />
          <input
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="Entry (opt)"
            type="number"
            step="0.0001"
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium"
            onClick={onAdd}
            disabled={addTrade.isPending}
          >
            <Plus className="inline w-3.5 h-3.5 mr-1" /> Add
          </button>
          <button
            className="rounded border border-border px-3 py-1.5 text-sm"
            onClick={onEvaluate}
            disabled={evaluate.isPending}
          >
            <Shield className="inline w-3.5 h-3.5 mr-1" /> Check Gate
          </button>
        </div>
      </section>

      {/* Risk limits */}
      <section className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="text-sm font-medium">Risk Limits</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <input
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="Daily loss"
            type="number"
            value={limitDaily || limits?.dailyLossLimit || ""}
            onChange={(e) => setLimitDaily(e.target.value)}
          />
          <input
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="Max positions"
            type="number"
            value={limitPositions || limits?.maxOpenPositions || ""}
            onChange={(e) => setLimitPositions(e.target.value)}
          />
          <input
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="Max size"
            type="number"
            value={limitSize || limits?.maxPositionSize || ""}
            onChange={(e) => setLimitSize(e.target.value)}
          />
          <input
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="Max exposure"
            type="number"
            value={limitExposure || limits?.maxPerSymbolExposure || ""}
            onChange={(e) => setLimitExposure(e.target.value)}
          />
        </div>
        <button
          className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium"
          onClick={onSaveLimits}
          disabled={setLimits.isPending}
        >
          Save Limits
        </button>
      </section>

      {/* Journal list */}
      <section className="rounded-lg border border-border p-4 space-y-2">
        <h2 className="text-sm font-medium">Journal</h2>
        {isLoading && <div className="text-sm text-muted">Loading...</div>}
        {isError && (
          <div className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load journal"}
          </div>
        )}
        {trades && trades.length === 0 && (
          <div className="text-sm text-muted">No trades recorded yet.</div>
        )}
        {trades && trades.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="py-1.5 pr-3">Symbol</th>
                  <th className="py-1.5 pr-3">Dir</th>
                  <th className="py-1.5 pr-3">Lot</th>
                  <th className="py-1.5 pr-3">Entry</th>
                  <th className="py-1.5 pr-3">PnL</th>
                  <th className="py-1.5 pr-3">Status</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 font-medium">{t.symbol}</td>
                    <td className="py-1.5 pr-3">{t.direction}</td>
                    <td className="py-1.5 pr-3">{t.lotSize}</td>
                    <td className="py-1.5 pr-3">{t.entryPrice}</td>
                    <td className="py-1.5 pr-3">{t.pnl ?? "-"}</td>
                    <td className="py-1.5 pr-3">{t.status}</td>
                    <td className="py-1.5 text-right">
                      <button
                        className="text-destructive"
                        onClick={() => onDelete(t.id)}
                        aria-label="Delete trade"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

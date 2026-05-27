import type { PendingOrder, Position } from "@/types/sniper";

export type UserTradesData = {
  positions: Position[];
  orders: PendingOrder[];
};

type TradeRow = Position | PendingOrder;

type PersistedTradeRow<Row extends TradeRow> = {
  row: Row;
  missingSince: number | null;
};

export type TradeContinuityState = {
  positions: PersistedTradeRow<Position>[];
  orders: PersistedTradeRow<PendingOrder>[];
};

export function reconcileUserTrades(
  previous: TradeContinuityState | null,
  next: UserTradesData,
  now: number,
  graceMs: number,
): { data: UserTradesData; state: TradeContinuityState } {
  const positions = reconcileTradeRows(previous?.positions, next.positions, now, graceMs);
  const orders = reconcileTradeRows(previous?.orders, next.orders, now, graceMs);

  return {
    data: {
      positions: positions.map((entry) => entry.row),
      orders: orders.map((entry) => entry.row),
    },
    state: {
      positions,
      orders,
    },
  };
}

function reconcileTradeRows<Row extends TradeRow>(
  previous: readonly PersistedTradeRow<Row>[] | undefined,
  incoming: readonly Row[],
  now: number,
  graceMs: number,
): PersistedTradeRow<Row>[] {
  const nextRows: PersistedTradeRow<Row>[] = [];
  const incomingById = new Map(incoming.map((row) => [row.id, row] as const));
  const retainedIds = new Set<string>();

  for (const previousEntry of previous ?? []) {
    const incomingRow = incomingById.get(previousEntry.row.id);
    if (incomingRow) {
      nextRows.push({
        row: reuseRowWhenUnchanged(previousEntry.row, incomingRow),
        missingSince: null,
      });
      retainedIds.add(incomingRow.id);
      continue;
    }

    const missingSince = previousEntry.missingSince ?? now;
    if (graceMs > 0 && now - missingSince < graceMs) {
      nextRows.push({
        row: markRowStale(previousEntry.row),
        missingSince,
      });
    }
  }

  for (const incomingRow of incoming) {
    if (retainedIds.has(incomingRow.id)) continue;
    nextRows.push({
      row: incomingRow,
      missingSince: null,
    });
  }

  return nextRows;
}

function reuseRowWhenUnchanged<Row extends TradeRow>(previous: Row, incoming: Row): Row {
  return shallowEqualTradeRow(previous, incoming) ? previous : incoming;
}

function markRowStale<Row extends TradeRow>(row: Row): Row {
  return row.state === "stale" ? row : { ...row, state: "stale" };
}

function shallowEqualTradeRow<Row extends TradeRow>(left: Row, right: Row): boolean {
  const leftKeys = Object.keys(left) as (keyof Row)[];
  const rightKeys = Object.keys(right) as (keyof Row)[];

  if (leftKeys.length !== rightKeys.length) return false;

  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false;
  }

  return true;
}

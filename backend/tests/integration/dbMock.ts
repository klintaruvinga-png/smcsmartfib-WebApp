import { vi } from "vitest";

// Shared mock of the Drizzle `db` client. Docker/local Supabase is unavailable,
// so queries are unit-tested against this in-memory chainable mock.
//
// NOTE: Vitest forbids `export const { ... } = vi.hoisted(...)`, so we assign the
// hoisted result to an intermediate `shared` binding and re-export its properties.
const shared = vi.hoisted(() => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const state: { result: unknown; resultQueue: unknown[] } = { result: [], resultQueue: [] };
  let insertError: Error | null = null;

  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    const builderMethods = [
      "select",
      "from",
      "where",
      "orderBy",
      "limit",
      "values",
      "onConflictDoUpdate",
      "set",
      "returning",
      "innerJoin",
      "leftJoin",
      "for",
    ];
    for (const m of builderMethods) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ method: m, args });
        return chain;
      };
    }
    // Make the chain awaitable: `await db.select()....` resolves to the next
    // result from the queue (if available) or falls back to state.result.
    chain.then = (resolve: (value: unknown) => void) => {
      const result = state.resultQueue.length > 0 ? state.resultQueue.shift() : state.result;
      return Promise.resolve(result).then(resolve);
    };
    return chain;
  };

  const db: Record<string, unknown> = {
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return makeChain();
    },
    insert: (...args: unknown[]) => {
      calls.push({ method: "insert", args });
      if (insertError) throw insertError;
      return makeChain();
    },
    delete: (...args: unknown[]) => {
      calls.push({ method: "delete", args });
      return makeChain();
    },
    update: (...args: unknown[]) => {
      calls.push({ method: "update", args });
      return makeChain();
    },
    // The transaction callback receives a tx object with the same query methods
    // as `db` (insert/update/select), so pass the full mock.
    transaction: async (cb: (tx: unknown) => unknown) => cb(db),
  };

  return {
    db,
    setDbResult: (r: unknown) => {
      state.result = r;
    },
    setDbResultQueue: (queue: unknown[]) => {
      state.resultQueue = queue;
    },
    getDbCalls: () => calls,
    resetCalls: () => {
      calls.length = 0;
    },
    setInsertError: (e: Error | null) => {
      insertError = e;
    },
  };
});

export const dbMock = shared.db;
export const setDbResult = shared.setDbResult;
export const setDbResultQueue = shared.setDbResultQueue;
export const getDbCalls = shared.getDbCalls;
export const resetCalls = shared.resetCalls;
export const setInsertError = shared.setInsertError;

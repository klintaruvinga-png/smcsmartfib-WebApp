/* @vitest-environment jsdom */

import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardSettings } from "@/types/sniper";

const apiMocks = vi.hoisted(() => ({
  getUserSettings: vi.fn(),
  normalizeBackendUrl: vi.fn((value?: string) => (typeof value === "string" ? value.trim() : "")),
  postWatchlistAdd: vi.fn(),
  postWatchlistRemove: vi.fn(),
  setBackendUrl: vi.fn(),
}));

vi.mock("@/lib/api/sniperClient", () => ({
  apiClient: {
    getUserSettings: apiMocks.getUserSettings,
    postWatchlistAdd: apiMocks.postWatchlistAdd,
    postWatchlistRemove: apiMocks.postWatchlistRemove,
  },
  normalizeBackendUrl: apiMocks.normalizeBackendUrl,
  setBackendUrl: apiMocks.setBackendUrl,
}));

import { useCanonicalWatchlist, useWatchlistAdd, useWatchlistRemove } from "./useSniperData";

const baseSettings: DashboardSettings = {
  backendUrl: "https://backend.example/wp-json",
  apiKeyStatus: "ok",
  refreshIntervalSec: 5,
  staleThresholdSec: 30,
  watchlist: ["AUDCAD", "EURJPY"],
  riskAllocation: { perTradePct: 1, dailyMaxPct: 2, ddCapPct: 5 },
};

describe("watchlist persistence", () => {
  let backendSettings: DashboardSettings;
  let queryClient: QueryClient;

  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    backendSettings = structuredClone(baseSettings);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    let getUserSettingsCallCount = 0;
    apiMocks.getUserSettings.mockReset();
    apiMocks.getUserSettings.mockImplementation(async () => {
      getUserSettingsCallCount += 1;
      if (getUserSettingsCallCount === 1) {
        return structuredClone(backendSettings);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      return structuredClone(backendSettings);
    });
    apiMocks.postWatchlistRemove.mockReset();
    apiMocks.postWatchlistRemove.mockImplementation(async (symbol: string) => {
      backendSettings = {
        ...backendSettings,
        watchlist: backendSettings.watchlist.filter((entry) => entry !== symbol),
      };
      return { ok: true, watchlist: structuredClone(backendSettings.watchlist) };
    });
    apiMocks.postWatchlistAdd.mockReset();
    apiMocks.postWatchlistAdd.mockImplementation(async (symbol: string) => {
      backendSettings = {
        ...backendSettings,
        watchlist: backendSettings.watchlist.includes(
          symbol as DashboardSettings["watchlist"][number],
        )
          ? backendSettings.watchlist
          : [...backendSettings.watchlist, symbol as DashboardSettings["watchlist"][number]],
      };
      return { ok: true, watchlist: structuredClone(backendSettings.watchlist) };
    });
    apiMocks.normalizeBackendUrl.mockClear();
    apiMocks.setBackendUrl.mockReset();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("keeps a removed symbol absent after a remount while the user-settings refetch lags", async () => {
    const watchlistView = renderHook(() => useCanonicalWatchlist(), { wrapper });
    const removeView = renderHook(() => useWatchlistRemove(), { wrapper });

    await waitFor(() => {
      expect(watchlistView.result.current.watchlist).toEqual(["AUDCAD", "EURJPY"]);
    });

    await act(async () => {
      await removeView.result.current.mutateAsync("AUDCAD");
    });

    await waitFor(() => {
      expect(watchlistView.result.current.watchlist).toEqual(["EURJPY"]);
    });

    watchlistView.unmount();

    const remountedView = renderHook(() => useCanonicalWatchlist(), { wrapper });

    expect(remountedView.result.current.watchlist).not.toContain("AUDCAD");

    await waitFor(
      () => {
        expect(remountedView.result.current.watchlist).toEqual(["EURJPY"]);
      },
      { timeout: 1500 },
    );
  });

  it("keeps a newly added symbol when a stale user-settings refetch resolves after the mutation", async () => {
    backendSettings = {
      ...structuredClone(baseSettings),
      watchlist: ["EURJPY"],
    };
    const staleSettings = structuredClone(backendSettings);
    let getUserSettingsCallCount = 0;
    apiMocks.getUserSettings.mockReset();
    apiMocks.getUserSettings.mockImplementation(async () => {
      getUserSettingsCallCount += 1;
      if (getUserSettingsCallCount === 1) {
        return structuredClone(backendSettings);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      return structuredClone(staleSettings);
    });

    const watchlistView = renderHook(() => useCanonicalWatchlist(), { wrapper });
    const addView = renderHook(() => useWatchlistAdd(), { wrapper });

    await waitFor(() => {
      expect(watchlistView.result.current.watchlist).toEqual(["EURJPY"]);
    });

    void queryClient.refetchQueries({ queryKey: ["user-settings"], type: "active" });

    await act(async () => {
      await addView.result.current.mutateAsync("AUDCAD");
    });

    await waitFor(() => {
      expect(watchlistView.result.current.watchlist).toEqual(["EURJPY", "AUDCAD"]);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });

    expect(watchlistView.result.current.watchlist).toEqual(["EURJPY", "AUDCAD"]);
  });

  it("routes malformed watchlist add responses into the mutation onError path", async () => {
    apiMocks.postWatchlistAdd.mockReset();
    apiMocks.postWatchlistAdd.mockRejectedValue(
      new Error("/user/watchlist/add: backend response missing watchlist array"),
    );

    const watchlistView = renderHook(() => useCanonicalWatchlist(), { wrapper });
    const addView = renderHook(() => useWatchlistAdd(), { wrapper });

    await waitFor(() => {
      expect(watchlistView.result.current.watchlist).toEqual(["AUDCAD", "EURJPY"]);
    });

    await act(async () => {
      await expect(addView.result.current.mutateAsync("GBPUSD")).rejects.toThrow(
        "/user/watchlist/add: backend response missing watchlist array",
      );
    });

    await waitFor(() => {
      expect(addView.result.current.isError).toBe(true);
    });

    expect(watchlistView.result.current.watchlist).toEqual(["AUDCAD", "EURJPY"]);
  });
});

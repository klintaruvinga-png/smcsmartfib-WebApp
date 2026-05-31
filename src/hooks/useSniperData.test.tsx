/* @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reactQueryMocks = vi.hoisted(() => ({
  keepPreviousData: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  useQueryClient: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  getAccountTelemetry: vi.fn(),
  getEngineHealth: vi.fn(),
  getLadders: vi.fn(),
  getLiveSignals: vi.fn(),
  getUserProgress: vi.fn(),
  getUserSettings: vi.fn(),
  normalizeBackendUrl: vi.fn((value?: string) => (typeof value === "string" ? value.trim() : "")),
  postWatchlistAdd: vi.fn(),
  postWatchlistRemove: vi.fn(),
  setBackendUrl: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: reactQueryMocks.keepPreviousData,
  useMutation: reactQueryMocks.useMutation,
  useQuery: reactQueryMocks.useQuery,
  useQueryClient: reactQueryMocks.useQueryClient,
}));

vi.mock("@/lib/api/sniperClient", () => ({
  apiClient: {
    getAccountTelemetry: apiMocks.getAccountTelemetry,
    getEngineHealth: apiMocks.getEngineHealth,
    getLadders: apiMocks.getLadders,
    getLiveSignals: apiMocks.getLiveSignals,
    getUserProgress: apiMocks.getUserProgress,
    getUserSettings: apiMocks.getUserSettings,
    postWatchlistAdd: apiMocks.postWatchlistAdd,
    postWatchlistRemove: apiMocks.postWatchlistRemove,
  },
  normalizeBackendUrl: apiMocks.normalizeBackendUrl,
  setBackendUrl: apiMocks.setBackendUrl,
}));

import { keepPreviousData } from "@tanstack/react-query";

import {
  createLaddersQueryOptions,
  useAccountTelemetry,
  useEngineHealth,
  useLiveSignals,
  usePollingUiState,
  useUserProgress,
  useWatchlistAdd,
  useWatchlistRemove,
} from "./useSniperData";

describe("useEngineHealth", () => {
  beforeEach(() => {
    reactQueryMocks.useQuery.mockReset();
    apiMocks.getAccountTelemetry.mockReset();
    apiMocks.getEngineHealth.mockReset();
    apiMocks.getLadders.mockReset();
    apiMocks.getLiveSignals.mockReset();
    apiMocks.getUserProgress.mockReset();
    apiMocks.getUserSettings.mockReset();
    apiMocks.postWatchlistAdd.mockReset();
    apiMocks.postWatchlistRemove.mockReset();
    apiMocks.setBackendUrl.mockReset();
    apiMocks.normalizeBackendUrl.mockClear();
  });

  it("overrides the global stale window so backend health refreshes every poll cycle", () => {
    let engineHealthOptions: Record<string, unknown> | undefined;

    reactQueryMocks.useQuery.mockImplementation((options: { queryKey: string[] }) => {
      if (options.queryKey[0] === "user-settings") {
        return {
          data: {
            backendUrl: "https://backend.example/wp-json",
            refreshIntervalSec: 5,
            watchlist: [],
          },
        };
      }

      if (options.queryKey[0] === "engine-health") {
        engineHealthOptions = options;
        return { data: undefined };
      }

      return { data: undefined };
    });

    renderHook(() => useEngineHealth());

    expect(engineHealthOptions).toMatchObject({
      queryKey: ["engine-health"],
      enabled: true,
      staleTime: 0,
      refetchInterval: 5_000,
    });
  });
});

describe("useAccountTelemetry", () => {
  beforeEach(() => {
    reactQueryMocks.useQuery.mockReset();
  });

  it("polls the backend-owned account telemetry endpoint on the settings cadence", () => {
    let accountTelemetryOptions: Record<string, unknown> | undefined;

    reactQueryMocks.useQuery.mockImplementation((options: { queryKey: string[] }) => {
      if (options.queryKey[0] === "user-settings") {
        return {
          data: {
            backendUrl: "https://backend.example/wp-json",
            refreshIntervalSec: 5,
            watchlist: [],
          },
        };
      }

      if (options.queryKey[0] === "account-telemetry") {
        accountTelemetryOptions = options;
        return { data: undefined };
      }

      return { data: undefined };
    });

    renderHook(() => useAccountTelemetry());

    expect(accountTelemetryOptions).toMatchObject({
      queryKey: ["account-telemetry"],
      enabled: true,
      refetchInterval: 5_000,
    });
  });
});

describe("useUserProgress", () => {
  beforeEach(() => {
    reactQueryMocks.useQuery.mockReset();
  });

  it("polls /user/progress on the settings cadence without adding cache time", () => {
    let progressOptions: Record<string, unknown> | undefined;

    reactQueryMocks.useQuery.mockImplementation((options: { queryKey: string[] }) => {
      if (options.queryKey[0] === "user-settings") {
        return {
          data: {
            backendUrl: "https://backend.example/wp-json",
            refreshIntervalSec: 5,
            watchlist: [],
          },
        };
      }

      if (options.queryKey[0] === "user-progress") {
        progressOptions = options;
        return { data: undefined };
      }

      return { data: undefined };
    });

    renderHook(() => useUserProgress());

    expect(progressOptions).toMatchObject({
      queryKey: ["user-progress"],
      enabled: true,
      staleTime: 0,
      refetchInterval: 5_000,
    });
  });
});

describe("useLiveSignals", () => {
  beforeEach(() => {
    reactQueryMocks.useQuery.mockReset();
  });

  it("disables the inherited stale window while preserving the polling cadence", () => {
    let liveSignalsOptions: Record<string, unknown> | undefined;

    reactQueryMocks.useQuery.mockImplementation((options: { queryKey: string[] }) => {
      if (options.queryKey[0] === "user-settings") {
        return {
          data: {
            backendUrl: "https://backend.example/wp-json",
            refreshIntervalSec: 5,
            watchlist: [],
          },
        };
      }

      if (options.queryKey[0] === "live-signals") {
        liveSignalsOptions = options;
        return { data: undefined };
      }

      return { data: undefined };
    });

    renderHook(() => useLiveSignals());

    expect(liveSignalsOptions).toMatchObject({
      queryKey: ["live-signals"],
      enabled: true,
      staleTime: 0,
      structuralSharing: false,
      placeholderData: keepPreviousData,
      refetchInterval: 5_000,
    });
  });
});

describe("useLadders", () => {
  it("retains previous ladder data while preserving the polling cadence", () => {
    expect(createLaddersQueryOptions(true, 5_000)).toMatchObject({
      queryKey: ["ladders"],
      enabled: true,
      placeholderData: keepPreviousData,
      refetchInterval: 5_000,
    });
  });
});

describe("usePollingUiState", () => {
  beforeEach(() => {
    reactQueryMocks.useQuery.mockReset();
    apiMocks.getUserSettings.mockReset();
    apiMocks.setBackendUrl.mockReset();
    apiMocks.normalizeBackendUrl.mockClear();
  });

  it("holds polling disabled while user settings are still loading", () => {
    reactQueryMocks.useQuery.mockImplementation((options: { queryKey: string[] }) => {
      if (options.queryKey[0] === "user-settings") {
        return {
          data: undefined,
          fetchStatus: "fetching",
          isPending: true,
          isLoading: true,
          refetch: vi.fn(),
        };
      }

      return { data: undefined };
    });

    const { result } = renderHook(() => usePollingUiState());

    expect(result.current).toMatchObject({
      backendReady: false,
      pendingSettingsLoad: true,
      missingBackendUrl: false,
      settingsLoadFailed: false,
      settingsLoadError: null,
      pollMs: null,
    });
    expect(result.current.retrySettingsLoad).toEqual(expect.any(Function));
  });

  it("marks the backend as unready after settings resolve without a backend URL", () => {
    reactQueryMocks.useQuery.mockImplementation((options: { queryKey: string[] }) => {
      if (options.queryKey[0] === "user-settings") {
        return {
          data: {
            backendUrl: "   ",
            refreshIntervalSec: 5,
            watchlist: [],
          },
          fetchStatus: "idle",
          isPending: false,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return { data: undefined };
    });

    const { result } = renderHook(() => usePollingUiState());

    expect(result.current).toMatchObject({
      backendReady: false,
      pendingSettingsLoad: false,
      missingBackendUrl: true,
      settingsLoadFailed: false,
      settingsLoadError: null,
      pollMs: 5_000,
    });
    expect(result.current.retrySettingsLoad).toEqual(expect.any(Function));
  });

  it("surfaces a settings-query failure separately from a missing backend URL", () => {
    const refetch = vi.fn();

    reactQueryMocks.useQuery.mockImplementation((options: { queryKey: string[] }) => {
      if (options.queryKey[0] === "user-settings") {
        return {
          data: undefined,
          error: new Error("settings fetch failed"),
          fetchStatus: "idle",
          isError: true,
          isPending: false,
          isLoading: false,
          status: "error",
          refetch,
        };
      }

      return { data: undefined };
    });

    const { result } = renderHook(() => usePollingUiState());

    expect(result.current).toMatchObject({
      backendReady: false,
      pendingSettingsLoad: false,
      missingBackendUrl: false,
      settingsLoadFailed: true,
      settingsLoadError: "settings fetch failed",
      pollMs: null,
    });
    expect(result.current.retrySettingsLoad).toBe(refetch);
  });
});

describe("watchlist mutation success handlers", () => {
  beforeEach(() => {
    reactQueryMocks.useMutation.mockReset();
    reactQueryMocks.useQueryClient.mockReset();
  });

  it("keeps user-settings canonical and refreshes dependent queries after add success", async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      refetchQueries: vi.fn().mockResolvedValue(undefined),
      setQueryData: vi.fn(),
    };
    let mutationOptions: Record<string, (...args: unknown[]) => unknown> | undefined;

    reactQueryMocks.useQueryClient.mockReturnValue(queryClient);
    reactQueryMocks.useMutation.mockImplementation((options) => {
      mutationOptions = options;
      return options;
    });

    renderHook(() => useWatchlistAdd());

    await mutationOptions?.onSuccess?.({ ok: true, watchlist: ["EURJPY"] });

    expect(queryClient.setQueryData).toHaveBeenCalledWith(["user-settings"], expect.any(Function));
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["user-settings"] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["snapshot"],
      refetchType: "none",
    });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({
      queryKey: ["snapshot"],
      type: "active",
    });
    expect(queryClient.setQueryData.mock.invocationCallOrder[0]).toBeLessThan(
      queryClient.invalidateQueries.mock.invocationCallOrder[0],
    );
  });

  it("keeps user-settings canonical and refreshes dependent queries after remove success", async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      refetchQueries: vi.fn().mockResolvedValue(undefined),
      setQueryData: vi.fn(),
    };
    let mutationOptions: Record<string, (...args: unknown[]) => unknown> | undefined;

    reactQueryMocks.useQueryClient.mockReturnValue(queryClient);
    reactQueryMocks.useMutation.mockImplementation((options) => {
      mutationOptions = options;
      return options;
    });

    renderHook(() => useWatchlistRemove());

    await mutationOptions?.onSuccess?.({ ok: true, watchlist: ["EURJPY"] });

    expect(queryClient.setQueryData).toHaveBeenCalledWith(["user-settings"], expect.any(Function));
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["user-settings"] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["snapshot"],
      refetchType: "none",
    });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({
      queryKey: ["snapshot"],
      type: "active",
    });
    expect(queryClient.setQueryData.mock.invocationCallOrder[0]).toBeLessThan(
      queryClient.invalidateQueries.mock.invocationCallOrder[0],
    );
  });
});

/* @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reactQueryMocks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  useQueryClient: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  getEngineHealth: vi.fn(),
  getUserSettings: vi.fn(),
  normalizeBackendUrl: vi.fn((value?: string) => (typeof value === "string" ? value.trim() : "")),
  setBackendUrl: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: reactQueryMocks.useMutation,
  useQuery: reactQueryMocks.useQuery,
  useQueryClient: reactQueryMocks.useQueryClient,
}));

vi.mock("@/lib/api/sniperClient", () => ({
  apiClient: {
    getEngineHealth: apiMocks.getEngineHealth,
    getUserSettings: apiMocks.getUserSettings,
  },
  normalizeBackendUrl: apiMocks.normalizeBackendUrl,
  setBackendUrl: apiMocks.setBackendUrl,
}));

import { useEngineHealth } from "./useSniperData";

describe("useEngineHealth", () => {
  beforeEach(() => {
    reactQueryMocks.useQuery.mockReset();
    apiMocks.getEngineHealth.mockReset();
    apiMocks.getUserSettings.mockReset();
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

/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useSnapshot: vi.fn(),
  useEngineBatch: vi.fn(),
  usePollMs: vi.fn(),
  useCanonicalWatchlist: vi.fn(),
  usePollingUiState: vi.fn(),
  alignWatchlistItems: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
  };
});

vi.mock("@/hooks/useSniperData", () => ({
  useSnapshot: hookMocks.useSnapshot,
  useEngineBatch: hookMocks.useEngineBatch,
  usePollMs: hookMocks.usePollMs,
  useCanonicalWatchlist: hookMocks.useCanonicalWatchlist,
  usePollingUiState: hookMocks.usePollingUiState,
  alignWatchlistItems: hookMocks.alignWatchlistItems,
}));

vi.mock("@/hooks/useStreamingTicks", () => ({
  useStreamingTicks: (value: number | undefined) => ({
    value,
    direction: null,
    heldDirection: null,
    motionKey: "test",
    motionImpulse: 0,
  }),
}));

vi.mock("@/hooks/useTickFlash", () => ({
  useTickFlash: () => null,
}));

import { LivePage } from "./live";

describe("LivePage backend gating", () => {
  beforeEach(() => {
    hookMocks.useSnapshot.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    hookMocks.useEngineBatch.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    hookMocks.usePollMs.mockReturnValue(2_000);
    hookMocks.useCanonicalWatchlist.mockReturnValue({
      watchlist: [],
    });
    hookMocks.alignWatchlistItems.mockReturnValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the configuration guard when polling is disabled because no backend URL is set", () => {
    hookMocks.usePollingUiState.mockReturnValue({
      backendReady: false,
      pendingSettingsLoad: false,
      missingBackendUrl: true,
      settingsLoadFailed: false,
      settingsLoadError: null,
      pollMs: 5_000,
      retrySettingsLoad: vi.fn(),
    });

    render(<LivePage />);

    expect(
      screen.getByText("Configure a backend URL in Account before loading live radar."),
    ).toBeTruthy();
  });

  it("keeps the loading state while user settings are still unresolved", () => {
    hookMocks.usePollingUiState.mockReturnValue({
      backendReady: false,
      pendingSettingsLoad: true,
      missingBackendUrl: false,
      settingsLoadFailed: false,
      settingsLoadError: null,
      pollMs: null,
      retrySettingsLoad: vi.fn(),
    });

    render(<LivePage />);

    expect(screen.getByText("Loading radar...")).toBeTruthy();
  });

  it("shows a retryable settings error instead of the backend URL guard when settings fail", () => {
    hookMocks.usePollingUiState.mockReturnValue({
      backendReady: false,
      pendingSettingsLoad: false,
      missingBackendUrl: false,
      settingsLoadFailed: true,
      settingsLoadError: "settings fetch failed",
      pollMs: null,
      retrySettingsLoad: vi.fn(),
    });

    render(<LivePage />);

    expect(
      screen.getByText("Unable to load Account settings. Retry before loading live radar."),
    ).toBeTruthy();
    expect(screen.getByText("settings fetch failed")).toBeTruthy();
    expect(
      screen.queryByText("Configure a backend URL in Account before loading live radar."),
    ).toBeNull();
  });
});

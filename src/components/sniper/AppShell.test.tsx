/* @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RouterState = {
  status: "idle" | "pending";
  location: { pathname: string };
};

const routerMocks = vi.hoisted(() => ({
  status: "idle" as "idle" | "pending",
  pathname: "/plan",
  navigate: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  clear: vi.fn(),
  refetchQueries: vi.fn(),
  useIsFetching: vi.fn(),
}));

const hookMocks = vi.hoisted(() => ({
  useSnapshot: vi.fn(),
  useLiveSignals: vi.fn(),
  useEngineHealth: vi.fn(),
  useSession: vi.fn(),
  useUserSettings: vi.fn(),
  usePollMs: vi.fn(),
  useCanonicalWatchlist: vi.fn(),
  alignWatchlistItems: vi.fn(),
}));

type MockLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  to: string;
};

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: MockLinkProps) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Outlet: () => <div data-testid="outlet">Route content</div>,
  useRouter: () => ({ navigate: routerMocks.navigate }),
  useRouterState: (options?: { select?: (state: RouterState) => unknown }) => {
    const state = {
      status: routerMocks.status,
      location: { pathname: routerMocks.pathname },
    };

    return options?.select ? options.select(state) : state;
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useIsFetching: queryMocks.useIsFetching,
  useQueryClient: () => ({
    clear: queryMocks.clear,
    refetchQueries: queryMocks.refetchQueries,
  }),
}));

vi.mock("sonner", () => ({
  Toaster: () => null,
}));

vi.mock("@/components/sniper/BrandPulseLogo", () => ({
  BrandPulseLogo: () => <div data-testid="brand-logo" />,
}));

vi.mock("@/hooks/useSniperData", () => ({
  useSnapshot: hookMocks.useSnapshot,
  useLiveSignals: hookMocks.useLiveSignals,
  useEngineHealth: hookMocks.useEngineHealth,
  useSession: hookMocks.useSession,
  useUserSettings: hookMocks.useUserSettings,
  usePollMs: hookMocks.usePollMs,
  useCanonicalWatchlist: hookMocks.useCanonicalWatchlist,
  alignWatchlistItems: hookMocks.alignWatchlistItems,
}));

import { AppShell } from "./AppShell";

describe("AppShell navigation loader", () => {
  beforeEach(() => {
    routerMocks.status = "idle";
    routerMocks.pathname = "/plan";
    queryMocks.useIsFetching.mockReturnValue(0);
    queryMocks.refetchQueries.mockResolvedValue(undefined);
    hookMocks.useSnapshot.mockReturnValue({ data: { prices: [] } });
    hookMocks.useLiveSignals.mockReturnValue({ data: [] });
    hookMocks.useEngineHealth.mockReturnValue({ data: { backendSync: "live" } });
    hookMocks.useSession.mockReturnValue({ data: { name: "London" } });
    hookMocks.useUserSettings.mockReturnValue({ data: {} });
    hookMocks.usePollMs.mockReturnValue(2000);
    hookMocks.useCanonicalWatchlist.mockReturnValue({ watchlist: [] });
    hookMocks.alignWatchlistItems.mockReturnValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("does not show the nav progress bar for background polling fetches", () => {
    queryMocks.useIsFetching.mockReturnValue(3);

    render(<AppShell />);

    expect(document.querySelector(".nav-progress-bar")).toBeNull();
  });

  it("shows the nav progress bar only while the router is navigating", () => {
    routerMocks.status = "pending";
    queryMocks.useIsFetching.mockReturnValue(0);

    render(<AppShell />);

    expect(document.querySelector(".nav-progress-bar")).toBeTruthy();
  });
});

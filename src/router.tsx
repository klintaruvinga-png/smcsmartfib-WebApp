import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { AuthError } from "@/lib/api/sniperClient";
import { SCHEMA_VERSION } from "@/lib/version";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (failureCount, error) => {
          if (error instanceof AuthError) return false;
          return failureCount < 3;
        },
      },
    },
  });

  // Front‑end schema versioning – invalidate React‑Query cache when the app version changes
  // (SCHEMA_VERSION is injected at build time via vite.config.ts)
  // This guards against stale snapshots persisting across deployments.
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("SCHEMA_VERSION");
    if (stored && stored !== String(SCHEMA_VERSION)) {
      // Clear all cached queries so fresh data is fetched with the new schema.
      queryClient.clear();
    }
    localStorage.setItem("SCHEMA_VERSION", String(SCHEMA_VERSION));
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ({ error }) => (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="text-sell text-sm font-mono">⚠️ ENGINE FAULT</div>
          <p className="mt-2 text-sm text-mute">{error.message}</p>
        </div>
      </div>
    ),
  });

  return router;
};

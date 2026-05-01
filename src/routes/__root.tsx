import { Outlet, Link, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appCss from "../styles.css?url";
import { AppShell } from "@/components/sniper/AppShell";

interface RouterContext {
  queryClient: QueryClient;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-tx font-mono">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-tx">Signal not found</h2>
        <p className="mt-2 text-sm text-mute">This route is not in the engine map.</p>
        <div className="mt-6">
          <Link
            to="/plan"
            className="inline-flex items-center justify-center rounded-md border border-accent/60 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
          >
            Return to Signal Plan
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SMC SuperFIB — Trading Dashboard" },
      { name: "description", content: "Mobile-first SMC SuperFIB dashboard mirroring the WordPress signal engine." },
      { name: "theme-color", content: "#07111b" },
      { property: "og:title", content: "SMC SuperFIB" },
      { property: "og:description", content: "Institutional SMC + Fibonacci trading dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}

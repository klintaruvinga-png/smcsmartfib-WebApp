import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Activity, LogIn } from "lucide-react";
import { setTokens } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setError(null);
    setLoading(true);

    try {
      const apiUrl =
        import.meta.env.VITE_API_URL || "https://smcsuperfibwebapp.klintaruvinga.workers.dev/api";
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Login failed");
      }

      const data = await response.json();

      if (!data.accessToken || !data.refreshToken) {
        throw new Error("Invalid login response: missing tokens");
      }

      setTokens(data.accessToken, data.refreshToken);

      // Brief pause so the success state is perceptible before transitioning.
      await new Promise((r) => setTimeout(r, 400));
      router.navigate({ to: "/plan" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="brand-mark flex h-12 w-12 items-center justify-center rounded-xl">
            <Activity className="h-6 w-6 text-[#1a1208]" strokeWidth={2.5} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight text-tx">SMC SuperFIB</h1>
            <p className="mt-1 text-xs text-mute font-mono tracking-wide">TRADING DASHBOARD</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border border-bd bg-bg1/60 p-4 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-[10px] font-mono uppercase tracking-wider text-mute"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded border border-bd bg-bg2/60 px-2.5 py-2 font-mono text-sm text-tx placeholder:text-mute/50 focus:outline-none focus:border-accent"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-[10px] font-mono uppercase tracking-wider text-mute"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded border border-bd bg-bg2/60 px-2.5 py-2 font-mono text-sm text-tx placeholder:text-mute/50 focus:outline-none focus:border-accent"
              />
            </div>

            {error && (
              <p className="rounded border border-sell/40 bg-sell/10 px-3 py-2 text-xs text-sell font-mono">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-buy/50 bg-buy/15 px-4 py-2.5 text-sm font-semibold text-buy hover:bg-buy/25 disabled:opacity-50 transition-colors"
            >
              <LogIn className="h-4 w-4" />
              {loading ? "Verifying..." : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

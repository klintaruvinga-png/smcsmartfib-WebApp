import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Activity, KeyRound, LogIn } from "lucide-react";
import { setCredentials } from "@/lib/auth";
import { apiClient, AuthError } from "@/lib/api/sniperClient";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !appPassword.trim()) return;

    setError(null);
    setLoading(true);
    setCredentials(username.trim(), appPassword.trim());

    try {
      await apiClient.getUserSettings(false);
      // Brief pause so the success state is perceptible before transitioning.
      await new Promise((r) => setTimeout(r, 400));
      router.navigate({ to: "/plan" });
    } catch (err) {
      if (err instanceof AuthError) {
        setError("Invalid credentials. Check your username and application password.");
      } else {
        setError(err instanceof Error ? err.message : "Login failed. Try again.");
      }
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
              <label className="block text-[10px] font-mono uppercase tracking-wider text-mute">
                WordPress Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="your-wp-username"
                className="w-full rounded border border-bd bg-bg2/60 px-2.5 py-2 font-mono text-sm text-tx placeholder:text-mute/50 focus:outline-none focus:border-accent"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-mute">
                Application Password
              </label>
              <input
                type="password"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
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
              disabled={loading || !username.trim() || !appPassword.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-buy/50 bg-buy/15 px-4 py-2.5 text-sm font-semibold text-buy hover:bg-buy/25 disabled:opacity-50 transition-colors"
            >
              <LogIn className="h-4 w-4" />
              {loading ? "Verifying..." : "Sign in"}
            </button>
          </div>
        </form>

        <div className="rounded-lg border border-bd/60 bg-bg1/30 p-4 space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-mute">
            <KeyRound className="h-3.5 w-3.5" />
            How to get an Application Password
          </div>
          <ol className="space-y-1 text-xs text-dim leading-relaxed list-decimal list-inside">
            <li>Log in to your WordPress admin</li>
            <li>
              Go to <span className="font-mono text-tx">Users → Profile</span>
            </li>
            <li>
              Scroll to <span className="font-mono text-tx">Application Passwords</span>
            </li>
            <li>
              Enter a name (e.g. "SuperFIB App") and click{" "}
              <span className="font-mono text-tx">Add New</span>
            </li>
            <li>Copy the generated password and paste it above</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

import { jsx, jsxs } from "react/jsx-runtime";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Activity, LogIn, KeyRound } from "lucide-react";
import { y as setCredentials, p as apiClient, A as AuthError } from "./router-DONb8JY3.js";
import "@tanstack/react-query";
import "clsx";
import "tailwind-merge";
import "sonner";
import "recharts";
import "@radix-ui/react-slot";
import "class-variance-authority";
function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !appPassword.trim()) return;
    setError(null);
    setLoading(true);
    setCredentials(username.trim(), appPassword.trim());
    try {
      await apiClient.getUserSettings(false);
      await new Promise((r) => setTimeout(r, 400));
      router.navigate({
        to: "/plan"
      });
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
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center bg-bg px-4", children: /* @__PURE__ */ jsxs("div", { className: "w-full max-w-sm space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-3", children: [
      /* @__PURE__ */ jsx("div", { className: "brand-mark flex h-12 w-12 items-center justify-center rounded-xl", children: /* @__PURE__ */ jsx(Activity, { className: "h-6 w-6 text-[#1a1208]", strokeWidth: 2.5 }) }),
      /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight text-tx", children: "SMC SuperFIB" }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-mute font-mono tracking-wide", children: "TRADING DASHBOARD" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("form", { onSubmit: handleSubmit, className: "space-y-4", children: /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 p-4 space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx("label", { className: "block text-[10px] font-mono uppercase tracking-wider text-mute", children: "WordPress Username" }),
        /* @__PURE__ */ jsx("input", { type: "text", value: username, onChange: (e) => setUsername(e.target.value), autoComplete: "username", placeholder: "your-wp-username", className: "w-full rounded border border-bd bg-bg2/60 px-2.5 py-2 font-mono text-sm text-tx placeholder:text-mute/50 focus:outline-none focus:border-accent" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx("label", { className: "block text-[10px] font-mono uppercase tracking-wider text-mute", children: "Application Password" }),
        /* @__PURE__ */ jsx("input", { type: "password", value: appPassword, onChange: (e) => setAppPassword(e.target.value), autoComplete: "current-password", placeholder: "xxxx xxxx xxxx xxxx xxxx xxxx", className: "w-full rounded border border-bd bg-bg2/60 px-2.5 py-2 font-mono text-sm text-tx placeholder:text-mute/50 focus:outline-none focus:border-accent" })
      ] }),
      error && /* @__PURE__ */ jsx("p", { className: "rounded border border-sell/40 bg-sell/10 px-3 py-2 text-xs text-sell font-mono", children: error }),
      /* @__PURE__ */ jsxs("button", { type: "submit", disabled: loading || !username.trim() || !appPassword.trim(), className: "flex w-full items-center justify-center gap-2 rounded-md border border-buy/50 bg-buy/15 px-4 py-2.5 text-sm font-semibold text-buy hover:bg-buy/25 disabled:opacity-50 transition-colors", children: [
        /* @__PURE__ */ jsx(LogIn, { className: "h-4 w-4" }),
        loading ? "Verifying..." : "Sign in"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd/60 bg-bg1/30 p-4 space-y-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-mute", children: [
        /* @__PURE__ */ jsx(KeyRound, { className: "h-3.5 w-3.5" }),
        "How to get an Application Password"
      ] }),
      /* @__PURE__ */ jsxs("ol", { className: "space-y-1 text-xs text-dim leading-relaxed list-decimal list-inside", children: [
        /* @__PURE__ */ jsx("li", { children: "Log in to your WordPress admin" }),
        /* @__PURE__ */ jsxs("li", { children: [
          "Go to ",
          /* @__PURE__ */ jsx("span", { className: "font-mono text-tx", children: "Users → Profile" })
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          "Scroll to ",
          /* @__PURE__ */ jsx("span", { className: "font-mono text-tx", children: "Application Passwords" })
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          'Enter a name (e.g. "SuperFIB App") and click',
          " ",
          /* @__PURE__ */ jsx("span", { className: "font-mono text-tx", children: "Add New" })
        ] }),
        /* @__PURE__ */ jsx("li", { children: "Copy the generated password and paste it above" })
      ] })
    ] })
  ] }) });
}
export {
  LoginPage as component
};

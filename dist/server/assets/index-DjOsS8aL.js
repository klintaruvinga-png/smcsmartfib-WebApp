import { jsx, jsxs } from "react/jsx-runtime";
import { useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Activity } from "lucide-react";
import { N as hasCredentials, O as hasWordPressNonce } from "./router-DONb8JY3.js";
import "@tanstack/react-query";
import "clsx";
import "tailwind-merge";
import "sonner";
import "recharts";
import "@radix-ui/react-slot";
import "class-variance-authority";
const DEFAULT_LANDING_DELAY_MS = 3600;
const LEAVE_DURATION_MS = 500;
const parsed = Number(void 0);
const LANDING_DELAY_MS = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_LANDING_DELAY_MS;
function LandingLoader() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    const leaveAt = Math.max(0, LANDING_DELAY_MS - LEAVE_DURATION_MS);
    const leaveTimer = setTimeout(() => setLeaving(true), leaveAt);
    const navTimer = setTimeout(() => {
      const authed = hasCredentials() || hasWordPressNonce();
      router.navigate({
        to: authed ? "/plan" : "/login"
      });
    }, LANDING_DELAY_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(leaveTimer);
      clearTimeout(navTimer);
    };
  }, [router]);
  const visible = mounted && !leaving;
  return /* @__PURE__ */ jsx("div", { className: ["flex min-h-screen items-center justify-center bg-bg px-4", "transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]", leaving ? "opacity-0" : "opacity-100"].join(" "), children: /* @__PURE__ */ jsxs("div", { className: ["flex flex-col items-center gap-5", "transform-gpu transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]", visible ? "opacity-100 translate-y-0 scale-100 blur-0" : leaving ? "opacity-0 -translate-y-1 scale-[1.02] blur-[2px]" : "opacity-0 translate-y-3 scale-95 blur-[2px]"].join(" "), children: [
    /* @__PURE__ */ jsx("div", { className: "brand-mark flex h-28 w-28 items-center justify-center rounded-2xl animate-pulse", children: /* @__PURE__ */ jsx(Activity, { className: "h-14 w-14 text-[#1a1208]", strokeWidth: 2.5 }) }),
    /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-3xl font-semibold tracking-tight text-tx", children: "SMC SuperFIB" }),
      /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs font-mono uppercase tracking-[0.2em] text-mute", children: "Signal Engine | Trading Dashboard | Account Manager" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsx("span", { className: "h-3 w-3 rounded-full bg-accent animate-bounce [animation-delay:-0.3s]" }),
      /* @__PURE__ */ jsx("span", { className: "h-3 w-3 rounded-full bg-accent animate-bounce [animation-delay:-0.15s]" }),
      /* @__PURE__ */ jsx("span", { className: "h-3 w-3 rounded-full bg-accent animate-bounce" })
    ] })
  ] }) });
}
export {
  LandingLoader as component
};

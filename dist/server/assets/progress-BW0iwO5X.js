import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { g as useUserAccount, h as useAccountTelemetry, i as useUserRiskProfile, j as useUserProgress, F as FreshnessBadge, k as fmtCurrency, f as cn, l as fmtPct } from "./router-DONb8JY3.js";
import { Flame } from "lucide-react";
import "@tanstack/react-router";
import "@tanstack/react-query";
import "react";
import "clsx";
import "tailwind-merge";
import "sonner";
import "recharts";
import "@radix-ui/react-slot";
import "class-variance-authority";
function toBadgeState(state) {
  if (state === "LIVE") return "live";
  if (state === "STALE") return "stale";
  return "unavailable";
}
function StreakPanelState({ message }) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mt-2", children: [
      /* @__PURE__ */ jsx(Flame, { className: "h-6 w-6 text-mute" }),
      /* @__PURE__ */ jsx("span", { className: "font-mono text-sm font-semibold", children: "Unavailable" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono text-mute mt-0.5", children: message })
  ] });
}
function ProgressLoadingBlock() {
  return /* @__PURE__ */ jsxs("div", { className: "mt-3 space-y-2 animate-pulse", "aria-label": "Loading progress data", children: [
    /* @__PURE__ */ jsx("div", { className: "h-5 w-20 rounded bg-bg3" }),
    /* @__PURE__ */ jsx("div", { className: "h-3 w-32 rounded bg-bg3" })
  ] });
}
function ProgressPage() {
  const { data: account } = useUserAccount();
  const { data: accountTelemetry } = useAccountTelemetry();
  const { data: risk } = useUserRiskProfile();
  const {
    data: progressData,
    isLoading: progressLoading,
    isError: progressError
  } = useUserProgress();
  if (!account) return null;
  const ddCap = risk?.ddCapPct ?? 6;
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight", children: "Progress" }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-mute mt-0.5", children: "Pulse - streaks - milestones" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 p-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: "Equity" }),
          /* @__PURE__ */ jsx(FreshnessBadge, { state: account.state })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "font-mono text-2xl font-semibold mt-2", children: fmtCurrency(account.equityUSC, accountTelemetry?.currency) }),
        /* @__PURE__ */ jsxs(
          "div",
          {
            className: cn(
              "text-xs font-mono mt-0.5",
              account.todayPnlUSC >= 0 ? "text-buy" : "text-sell"
            ),
            children: [
              fmtCurrency(account.todayPnlUSC, accountTelemetry?.currency, true),
              " today"
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 p-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: "Streak" }),
          progressData ? /* @__PURE__ */ jsx(FreshnessBadge, { state: toBadgeState(progressData.streak.state) }) : null
        ] }),
        progressLoading ? /* @__PURE__ */ jsx(ProgressLoadingBlock, {}) : progressError || !progressData ? /* @__PURE__ */ jsx(StreakPanelState, { message: "Progress data unavailable while /user/progress is unreachable." }) : progressData.streak.state === "UNAVAILABLE" ? /* @__PURE__ */ jsx(StreakPanelState, { message: "No engine run data found for this account yet." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mt-2", children: [
            /* @__PURE__ */ jsx(Flame, { className: "h-6 w-6 text-warn" }),
            /* @__PURE__ */ jsxs("span", { className: "font-mono text-2xl font-semibold", children: [
              progressData.streak.currentStreakDays,
              "d"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "text-[10px] font-mono text-mute mt-0.5", children: [
            "Last active ",
            progressData.streak.lastActiveDate ?? "unknown"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 p-4", children: [
        /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: "DD remaining" }),
        /* @__PURE__ */ jsx("div", { className: "font-mono text-2xl font-semibold mt-2 text-buy", children: fmtPct(ddCap - account.drawdownPct, false) }),
        /* @__PURE__ */ jsxs("div", { className: "text-[10px] font-mono text-mute mt-0.5", children: [
          "before cap of ",
          fmtPct(ddCap, false)
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/60 p-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-bd px-4 py-2.5", children: [
        /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: "Milestones" }),
        progressData ? /* @__PURE__ */ jsx(FreshnessBadge, { state: toBadgeState(progressData.milestones.state) }) : null
      ] }),
      progressLoading ? /* @__PURE__ */ jsx("div", { className: "px-4 py-4", children: /* @__PURE__ */ jsx(ProgressLoadingBlock, {}) }) : progressError || !progressData ? /* @__PURE__ */ jsx("div", { className: "px-4 py-6 text-sm text-dim", children: "Milestone progress is unavailable while /user/progress is unreachable." }) : /* @__PURE__ */ jsxs("div", { className: "space-y-3 px-4 py-4 text-sm", children: [
        /* @__PURE__ */ jsx(
          MilestoneRow,
          {
            label: "First heartbeat",
            complete: progressData.milestones.firstHeartbeat
          }
        ),
        /* @__PURE__ */ jsx(
          MilestoneRow,
          {
            label: "First market stream",
            complete: progressData.milestones.firstMarketStream
          }
        ),
        /* @__PURE__ */ jsx(
          MilestoneRow,
          {
            label: "First trade telemetry",
            complete: progressData.milestones.firstTradeTelemetry
          }
        )
      ] })
    ] })
  ] });
}
function MilestoneRow({ label, complete }) {
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
    /* @__PURE__ */ jsx("span", { className: "font-mono text-[11px] uppercase tracking-wider text-mute", children: label }),
    /* @__PURE__ */ jsx(
      "span",
      {
        className: cn(
          "rounded border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider",
          complete ? "border-buy/40 bg-buy/15 text-buy" : "border-mute/30 bg-mute/10 text-mute"
        ),
        children: complete ? "Complete" : "Pending"
      }
    )
  ] });
}
const SplitComponent = ProgressPage;
export {
  SplitComponent as component
};

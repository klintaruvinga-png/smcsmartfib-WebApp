import { jsx, jsxs } from "react/jsx-runtime";
import { f as cn } from "./router-DONb8JY3.js";
function AnchorPositionMeter({ label, pct }) {
  if (pct === null) return null;
  const clamped = Math.min(100, Math.max(0, pct));
  const inEq = clamped >= 37.5 && clamped <= 62.5;
  const color = inEq ? "bg-warn" : clamped > 62.5 ? "bg-buy" : "bg-sell";
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
    /* @__PURE__ */ jsx("span", { className: "font-mono text-[10px] text-mute w-5", children: label }),
    /* @__PURE__ */ jsxs("div", { className: "relative h-1.5 flex-1 overflow-hidden rounded-full bg-bg3", children: [
      /* @__PURE__ */ jsx("div", { className: "absolute top-0 h-full bg-warn/20", style: { left: "37.5%", width: "25%" } }),
      /* @__PURE__ */ jsx(
        "div",
        {
          className: cn("absolute top-0 h-2 w-0.5 rounded-full -mt-px", color),
          style: { left: `${clamped}%`, transform: "translateX(-50%)" }
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("span", { className: "font-mono text-[10px] text-mute w-8 text-right", children: [
      clamped.toFixed(0),
      "%"
    ] })
  ] });
}
function AnchorChopBadge({ source }) {
  if (!source || source === "none") {
    return /* @__PURE__ */ jsx("span", { className: "inline-flex items-center rounded border border-buy/40 bg-buy/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-buy", children: "clear" });
  }
  if (source === "SF+AF") {
    return /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center rounded border border-sell/50 bg-sell/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-sell", children: [
      "chop ",
      source
    ] });
  }
  return /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center rounded border border-warn/50 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-warn", children: [
    "caution ",
    source
  ] });
}
function GateBadge({ allow }) {
  const map = {
    BUY: "border-buy/50 text-buy bg-buy/10",
    SELL: "border-sell/50 text-sell bg-sell/10",
    BOTH: "border-info/50 text-info bg-info/10",
    BLOCKED: "border-mute/50 text-mute bg-mute/10"
  };
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
        map[allow]
      ),
      children: allow
    }
  );
}
function BiasBadge({ bias }) {
  const map = {
    BULL: "border-buy/40 text-buy bg-buy/10",
    BEAR: "border-sell/40 text-sell bg-sell/10",
    RANGING: "border-mute/40 text-mute bg-mute/10"
  };
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
        map[bias]
      ),
      children: bias
    }
  );
}
export {
  AnchorChopBadge as A,
  BiasBadge as B,
  GateBadge as G,
  AnchorPositionMeter as a
};

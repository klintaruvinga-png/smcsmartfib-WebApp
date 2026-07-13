import { jsxs, jsx } from "react/jsx-runtime";
import { AlertTriangle, RefreshCw } from "lucide-react";
function SettingsQueryErrorState({
  resourceLabel,
  errorDetail,
  onRetry
}) {
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3 rounded-lg border border-warn/30 bg-warn/5 p-4 text-sm", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2 text-warn", children: [
      /* @__PURE__ */ jsx(AlertTriangle, { className: "mt-0.5 h-4 w-4 shrink-0" }),
      /* @__PURE__ */ jsxs("div", { children: [
        "Unable to load Account settings. Retry before loading ",
        resourceLabel,
        "."
      ] })
    ] }),
    errorDetail && /* @__PURE__ */ jsx("div", { className: "text-xs text-mute", children: errorDetail }),
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: () => void onRetry(),
        className: "inline-flex items-center gap-1.5 rounded border border-bd bg-bg2/60 px-3 py-1.5 text-[11px] font-mono text-dim transition-colors hover:border-info/40 hover:text-fg",
        children: [
          /* @__PURE__ */ jsx(RefreshCw, { className: "h-3 w-3" }),
          "Retry settings"
        ]
      }
    )
  ] });
}
export {
  SettingsQueryErrorState as S
};

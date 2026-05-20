import { createFileRoute } from "@tanstack/react-router";
import { PlanPage } from "./-plan.page";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "Signal Plans - SMC SuperFIB" },
      {
        name: "description",
        content:
          "Top ranked watchlist execution plans with backend blueprints, risk, and ladder status.",
      },
      { property: "og:title", content: "Signal Plans - SMC SuperFIB" },
      {
        property: "og:description",
        content:
          "Backend-confirmed entry ladders, SL, TP, and risk allocation for the top watchlist candidates.",
      },
    ],
  }),
  component: PlanPage,
});

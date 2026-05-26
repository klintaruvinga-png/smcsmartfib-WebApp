import { createFileRoute } from "@tanstack/react-router";
import { SignalsPage } from "./-signals.page";

export const Route = createFileRoute("/signals")({
  head: () => ({
    meta: [
      { title: "Signal Engine \u2014 SMC SuperFIB" },
      {
        name: "description",
        content: "Engine readiness checklist and live signal candidates with backend confirmation.",
      },
      {
        property: "og:title",
        content: "Signal Engine \u2014 SMC SuperFIB",
      },
      { property: "og:description", content: "Engine health and live candidate signals." },
    ],
  }),
  component: SignalsPage,
});

import { createFileRoute } from "@tanstack/react-router";
import { LivePage } from "./-live.page";

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Live Radar - SMC SuperFIB" },
      { name: "description", content: "Per-pair live prices, regime, gate state and chop meter." },
      { property: "og:title", content: "Live Radar - SMC SuperFIB" },
      { property: "og:description", content: "Real-time multi-pair regime + gate radar." },
    ],
  }),
  component: LivePage,
});

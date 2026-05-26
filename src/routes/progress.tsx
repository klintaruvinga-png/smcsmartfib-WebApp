import { createFileRoute } from "@tanstack/react-router";
import { ProgressPage } from "./-progress.page";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress - SMC SuperFIB" },
      { name: "description", content: "Account pulse, milestones and trading streaks." },
      { property: "og:title", content: "Progress - SMC SuperFIB" },
      { property: "og:description", content: "Track milestones and account growth." },
    ],
  }),
  component: ProgressPage,
});

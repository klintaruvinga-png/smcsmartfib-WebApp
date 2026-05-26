import { createFileRoute } from "@tanstack/react-router";
import { BookPage } from "./-book.page";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Active Book - SMC SuperFIB" },
      {
        name: "description",
        content: "Open positions grouped by symbol with pair-level freshness warnings.",
      },
      { property: "og:title", content: "Active Book - SMC SuperFIB" },
      { property: "og:description", content: "All open positions in one consolidated book." },
    ],
  }),
  component: BookPage,
});

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/soak-report")({
  beforeLoad: () => {
    throw redirect({ to: "/admin", replace: true });
  },
});

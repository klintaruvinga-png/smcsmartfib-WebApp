import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/soak-report")({
  beforeLoad: () => {
    // Direct visits fold into /admin because the soak workspace is owned by admin.tsx.
    throw redirect({ to: "/admin", replace: true });
  },
});

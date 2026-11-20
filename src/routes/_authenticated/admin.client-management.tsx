import { createFileRoute, redirect } from "@tanstack/react-router";

// The old "ניהול לקוחות" journal screen was merged into the unified clients page on 2026-11-20 —
// old links and bookmarks land there.
export const Route = createFileRoute("/_authenticated/admin/client-management")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/newborn-packages" });
  },
});

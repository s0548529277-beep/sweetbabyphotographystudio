import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

// The outdoor client list and package types now live in the unified clients page
// (/admin/newborn-packages?kind=outdoor). This route only stays as the parent of the outdoor client
// page (/admin/outdoor-packages/$orderId, its gallery and steps) and to redirect old links.
export const Route = createFileRoute("/_authenticated/admin/outdoor-packages")({
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/$/, "") === "/admin/outdoor-packages") {
      throw redirect({ to: "/admin/newborn-packages", search: { kind: "outdoor" } });
    }
  },
  component: Outlet,
});

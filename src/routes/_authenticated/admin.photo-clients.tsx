import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

// The general photo-client list now lives in the unified clients page
// (/admin/newborn-packages?kind=general). This route only stays as the parent of the client card
// (/admin/photo-clients/$bookingId) and to redirect old links ("?kind=send" was the send-only tab).
export const Route = createFileRoute("/_authenticated/admin/photo-clients")({
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/$/, "") === "/admin/photo-clients") {
      throw redirect({ to: "/admin/newborn-packages", search: { kind: "general" } });
    }
  },
  component: Outlet,
});

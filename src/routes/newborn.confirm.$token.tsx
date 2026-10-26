import { createFileRoute, redirect } from "@tanstack/react-router";

// Old one-click confirm link, still inside contract emails already sent.
// Since 2026-10-26 confirming happens on the section-by-section signing page
// (owner request) — /contract/newborn/$token, same token.
export const Route = createFileRoute("/newborn/confirm/$token")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/contract/$kind/$token", params: { kind: "newborn", token: params.token } });
  },
});

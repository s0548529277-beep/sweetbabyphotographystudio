// Global client middleware (registered in start.ts): adds the visitor id, when the visitor accepted the cookie
// banner, to every server-function call. The server uses it to tie her browsing history to the details she leaves
// (see visitor-tracking.server.ts). Without consent no header is sent.
import { createMiddleware } from "@tanstack/react-start";
import { getVisitorId } from "@/lib/visitor-id";

export const attachVisitorId = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const id = getVisitorId();
  return next({ headers: id ? { "x-visitor-id": id } : {} });
});

import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Receives the "seconds spent on this page" beacon from site-tracking.tsx. It is sent with navigator.sendBeacon
// while the page is being left, so it has to be a plain POST endpoint (a server function cannot be called from
// pagehide reliably). Body: text/plain JSON {s: sessionId, p: path, t: seconds}. Always answers 204; any problem
// is swallowed, analytics must never break anything.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/track-dwell")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          if (raw.length > 2000) return new Response(null, { status: 204 });
          const b = JSON.parse(raw);
          const s = String(b?.s ?? "");
          const p = String(b?.p ?? "");
          const t = Number(b?.t);
          if (UUID_RE.test(s) && p.startsWith("/") && p.length <= 500 && Number.isFinite(t) && t > 0) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { addDwell } = await import("@/lib/visitor-tracking.server");
            await addDwell(supabaseAdmin as any, s, p, t);
          }
        } catch (e) {
          console.error("[SWEETBABY] track-dwell failed", e);
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});

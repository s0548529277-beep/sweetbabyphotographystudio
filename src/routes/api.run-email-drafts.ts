import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Dedicated, database-triggered run of the e-mail draft assistant (owner request 19.11: "every 10 minutes, prepare everything
// at once, no limit"). pg_cron inside the project's own database calls this route every 10 minutes through pg_net
// (migration 0046, job `email-drafts-every-10-min`), so it no longer depends on the external scheduler that calls
// /api/send-booking-reminders every 15 minutes and does not wait for a long run.
//
// Header `x-cron-secret` must equal app_settings.email_drafts_cron_secret (admin-only table). The assistant itself keeps its
// own rules: window 07:30-23:50 Israel time, not on Shabbat, gap of 9 minutes since the last run. Unlike the old route it has no
// per-run cap on drafts, only a time budget (DEDICATED_DRAFT_LIMITS).
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/run-email-drafts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const given = request.headers.get("x-cron-secret") ?? "";
        const { data } = await db.from("app_settings").select("value").eq("key", "email_drafts_cron_secret").maybeSingle();
        const expected = String(data?.value ?? "");
        if (!sameSecret(given, expected)) return json(401, { error: "unauthorized" });

        const started = Date.now();
        try {
          const { runEmailDraftAssistant, DEDICATED_DRAFT_LIMITS } = await import("@/lib/email-drafts.server");
          const r = await runEmailDraftAssistant({ limits: DEDICATED_DRAFT_LIMITS });
          return json(200, {
            ok: true,
            ran: r.ran,
            reason: r.reason ?? null,
            created: r.created.length,
            autoSent: r.created.filter((c) => c.autoSent).length,
            skipped: r.skipped,
            errors: r.errors,
            ms: Date.now() - started,
          });
        } catch (e: any) {
          console.error("[SWEETBABY] run-email-drafts failed", e);
          return json(500, { ok: false, error: String(e?.message ?? e).slice(0, 200), ms: Date.now() - started });
        }
      },
    },
  },
});

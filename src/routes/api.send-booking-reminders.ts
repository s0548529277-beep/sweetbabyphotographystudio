import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { runDueBookingReminders, runDueAbandonedHoldReminders, notifyPendingPhoneBookingConfirmations, notifyPendingPropsRequests } from "@/lib/bookings.functions";
import { runDueOrderReminders } from "@/lib/orders.functions";
import { runDueProofSelectionReminders } from "@/lib/photo-clients.functions";
import { runDuePendingPassApprovalNudges } from "@/lib/subscription-purchase.functions";
import { runDataBackupIfDue } from "@/lib/data-backup.server";
import { runDueRecurringExpenses } from "@/lib/recurring-expenses.functions";
import { runDueOutdoorStylingCallReminders } from "@/lib/outdoor-packages.functions";
import { runDueClientManagementReminders } from "@/lib/client-management.functions";
import { runEmailDraftAssistant } from "@/lib/email-drafts.server";
import { runDuePostSessionThanks, runDueUnfinishedBookingFollowUps, runDuePreSessionReminders } from "@/lib/booking-followups.server";

// Called periodically (every 15-30 min recommended) by an external
// scheduler — e.g. a free cron service like cron-job.org, or Supabase
// pg_cron + pg_net — to send a reminder (email + a Yemot voice call) to
// customers with a confirmed studio booking OR a confirmed props/equipment
// order (pickup) who opted in on the deposit/checkout screen, at the
// "hours before" timing they chose there — nobody gets a reminder unless
// she asked for one. Also runs the (opt-out-free, always-on) 7-day
// post-shoot "please pick your proof photos" reminder — see
// runDueProofSelectionReminders in photo-clients.functions.ts — and the
// abandoned-cart-style "your spot is still held" email shortly before an
// unpaid website booking's temporary hold silently expires, see
// runDueAbandonedHoldReminders in bookings.functions.ts. Also runs
// runDueRecurringExpenses (recurring-expenses.functions.ts), which
// auto-inserts this month's row for any admin-defined recurring expense
// (e.g. rent) once its day of the month has passed.
//
// Protected by a shared-secret query param so it can't be triggered by
// randoms: set REMINDER_CRON_SECRET in the project's environment variables,
// then schedule a GET request to:
//   https://sweetbabyphoto.shop/api/send-booking-reminders?key=<the secret>
export const Route = createFileRoute("/api/send-booking-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const key = url.searchParams.get("key");
        const expected = process.env.REMINDER_CRON_SECRET;

        if (!expected || key !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        // One failing job must not take the whole run (and every other reminder) down with it:
        // each job is wrapped, its error is recorded and shown on the admin dashboard.
        const errors: Record<string, string> = {};
        // Which jobs have finished so far (written after every job): if the run is cut off, this shows the one that never finished.
        const doneJobs: Record<string, number> = {};
        const startedAt = Date.now();
        const safe = <T,>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> =>
          Promise.race([
            fn(),
            // A job that hangs (never resolves) used to block the whole run, so no heartbeat was written.
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout after 40s")), 40_000)),
          ]).then((v) => { doneJobs[name] = Date.now() - startedAt; void stamp("scheduler_progress", JSON.stringify({ at: new Date().toISOString(), done: doneJobs })); return v; }).catch((e: any) => {
            errors[name] = String(e?.message ?? e).slice(0, 300);
            console.error(`[SWEETBABY] scheduler job ${name} failed`, e);
            return { error: errors[name] };
          });
        const stamp = async (k: string, v: string) => {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await (supabaseAdmin as any).from("app_settings").upsert({ key: k, value: v, updated_at: new Date().toISOString() });
          } catch (e) {
            console.error("[SWEETBABY] scheduler stamp failed", k, e);
          }
        };
        await stamp("scheduler_last_call", new Date().toISOString());

        const [followUpDigest, bookings, orders, pendingPhoneCalls, pendingPropsCalls, proofReminders, abandonedHolds, pendingPassApprovals, dataBackup, recurringExpenses, outdoorStylingCallReminders, clientManagement, emailDrafts, postSessionThanks, unfinishedBookings, preSessionReminders] = await Promise.all([
          // Hourly "who to call back and why" summary mail — see follow-up-digest.server.ts.
          safe("followUpDigest", async () => (await import("@/lib/follow-up-digest.server")).runHourlyFollowUpDigest()),
          safe("bookings", () => runDueBookingReminders()),
          safe("orders", () => runDueOrderReminders()),
          safe("pendingPhoneCalls", () => notifyPendingPhoneBookingConfirmations()),
          safe("pendingPropsCalls", () => notifyPendingPropsRequests()),
          safe("proofReminders", () => runDueProofSelectionReminders()),
          safe("abandonedHolds", () => runDueAbandonedHoldReminders()),
          safe("pendingPassApprovals", () => runDuePendingPassApprovalNudges()),
          safe("dataBackup", () => runDataBackupIfDue()),
          safe("recurringExpenses", () => runDueRecurringExpenses()),
          safe("outdoorStylingCallReminders", () => runDueOutdoorStylingCallReminders()),
          // Own catch: the cm_* tables may not exist until the migration is applied.
          safe("clientManagement", () => runDueClientManagementReminders()),
          // Automatic designed reply drafts in Gmail (never sends) — see email-drafts.server.ts.
          safe("emailDrafts", () => runEmailDraftAssistant()),
          // Thank-you after the session + gentle nudge for an unfinished booking — see booking-followups.server.ts.
          safe("postSessionThanks", () => runDuePostSessionThanks()),
          safe("unfinishedBookings", () => runDueUnfinishedBookingFollowUps()),
          safe("preSessionReminders", () => runDuePreSessionReminders()),
        ]);
        // Heartbeat: lets the admin dashboard warn when the external scheduler stops calling this route.
        await stamp("scheduler_last_run", new Date().toISOString());
        await stamp("scheduler_last_errors", JSON.stringify({ at: new Date().toISOString(), errors }));
        return new Response(JSON.stringify({ followUpDigest, bookings, orders, pendingPhoneCalls, pendingPropsCalls, proofReminders, abandonedHolds, pendingPassApprovals, dataBackup, recurringExpenses, outdoorStylingCallReminders, clientManagement, emailDrafts, postSessionThanks, unfinishedBookings, preSessionReminders }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

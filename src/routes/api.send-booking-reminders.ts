import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { runDueBookingReminders, runDueAbandonedHoldReminders, notifyPendingPhoneBookingConfirmations, notifyPendingPropsRequests } from "@/lib/bookings.functions";
import { runDueOrderReminders } from "@/lib/orders.functions";
import { runDueProofSelectionReminders } from "@/lib/photo-clients.functions";
import { runDuePendingPassApprovalNudges } from "@/lib/subscription-purchase.functions";
import { runDataBackupIfDue } from "@/lib/data-backup.server";
import { runDueRecurringExpenses } from "@/lib/recurring-expenses.functions";

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

        const [bookings, orders, pendingPhoneCalls, pendingPropsCalls, proofReminders, abandonedHolds, pendingPassApprovals, dataBackup, recurringExpenses] = await Promise.all([
          runDueBookingReminders(),
          runDueOrderReminders(),
          notifyPendingPhoneBookingConfirmations(),
          notifyPendingPropsRequests(),
          runDueProofSelectionReminders(),
          runDueAbandonedHoldReminders(),
          runDuePendingPassApprovalNudges(),
          runDataBackupIfDue(),
          runDueRecurringExpenses(),
        ]);
        return new Response(JSON.stringify({ bookings, orders, pendingPhoneCalls, pendingPropsCalls, proofReminders, abandonedHolds, pendingPassApprovals, dataBackup, recurringExpenses }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

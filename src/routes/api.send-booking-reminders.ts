import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { runDueBookingReminders } from "@/lib/bookings.functions";
import { runDueOrderReminders } from "@/lib/orders.functions";

// Called periodically (every 15-30 min recommended) by an external
// scheduler — e.g. a free cron service like cron-job.org, or Supabase
// pg_cron + pg_net — to send the "starts in ~12 hours" reminder email to
// customers with a confirmed studio booking OR a confirmed props/equipment
// order (pickup).
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

        const [bookings, orders] = await Promise.all([runDueBookingReminders(), runDueOrderReminders()]);
        return new Response(JSON.stringify({ bookings, orders }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const minToTime = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/**
 * Every busy interval for a given date — studio bookings saved in the app AND
 * real events on the studio's Google Calendar. Prop-rental pickups are created
 * as "transparent" events, so they never block the studio.
 * Public on purpose: it only exposes busy time ranges, no personal data.
 */
export const getStudioDayBusy = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ date: z.string().min(10).max(10) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const out: Array<{ start_time: string; end_time: string }> = [];

    const { data: rows } = await supabaseAdmin
      .from("bookings")
      .select("start_time, end_time, status")
      .eq("session_date", data.date)
.neq("status", "cancelled")
.neq("deposit_status", "pending");
    for (const b of rows ?? []) {
      out.push({ start_time: String(b.start_time).slice(0, 5), end_time: String(b.end_time).slice(0, 5) });
    }

    try {
      const { listGoogleCalendarBusy } = await import("@/integrations/google/calendar.server");
      const busy = await listGoogleCalendarBusy(data.date, data.date);
      for (const [s, e] of busy[data.date] ?? []) {
        out.push({ start_time: minToTime(Math.max(0, s)), end_time: minToTime(Math.min(24 * 60 - 1, e)) });
      }
    } catch (e) {
      console.error("[SWEETBABY] calendar busy read failed", e);
    }

    return out;
  });

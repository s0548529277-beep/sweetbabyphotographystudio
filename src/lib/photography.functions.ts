import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Photography session with Michal, booked into the studio calendar. */
export const PHOTOGRAPHY_HOURLY_RATE = 300;

export const PAYMENT_LABELS: Record<string, string> = {
  cash: "מזומן בסטודיו",
  transfer: "העברה בנקאית",
  bit: "ביט / פייבוקס",
  later: "סגירה טלפונית עם הצלמת",
};

const schema = z.object({
  session_date: z.string().min(10),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  hours: z.number().min(0.5).max(8),
  contact_name: z.string().min(1).max(120),
  contact_phone: z.string().min(5).max(40),
  contact_email: z.string().email().max(160).optional().nullable(),
  payment_method: z.enum(["cash", "transfer", "bit", "later"]).default("cash"),
  session_type: z.string().max(80).optional().nullable(),
  location: z.enum(["studio", "outdoor"]).default("studio"),
  notes: z.string().max(1000).optional().nullable(),
});


export const requestPhotographySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const slots = Math.round(data.hours * 2);
    const [h, m] = data.start_time.split(":").map(Number);
    const startMin = h * 60 + m;
    const endMin = startMin + slots * 30;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
    const price = Math.round(PHOTOGRAPHY_HOURLY_RATE * data.hours);

    const { data: existing, error: exErr } = await supabase
      .from("bookings")
      .select("id, start_time, end_time")
      .eq("session_date", data.session_date)
      .neq("status", "cancelled");
    if (exErr) throw new Error(exErr.message);
    for (const b of existing ?? []) {
      const [bh, bm] = String(b.start_time).split(":").map(Number);
      const [eh, em] = String(b.end_time).split(":").map(Number);
      if (startMin < eh * 60 + em && endMin > bh * 60 + bm) {
        throw new Error("השעה שבחרת כבר תפוסה ביומן הסטודיו. נסי שעה אחרת.");
      }
    }

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        user_id: userId,
        session_date: data.session_date,
        start_time: data.start_time,
        end_time: endTime,
        slots,
        package: "photography",
        price,
        deposit_amount: 0,
        balance_amount: price,
        status: "pending",
        deposit_status: "pending",
        contact_name: data.contact_name,
        contact_phone: data.contact_phone,
        reserved_items: [],
        terms_accepted_at: new Date().toISOString(),
        notes: [
          `📸 צילומים עם מיכל סיבוני (${data.location === "outdoor" ? "צילומי חוץ" : "בסטודיו"})`,
          data.session_type ? `סוג צילום: ${data.session_type}` : null,
          "המועד ייקבע סופית לאחר תיאום עם הצלמת.",
          data.notes,
        ]
          .filter(Boolean)
          .join("\n"),
      })
      .select("id, price")
      .single();
    if (error || !booking) throw new Error(error?.message ?? "קביעת המועד נכשלה");

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("admin_notifications").insert({
        type: "photography_request",
        title: `בקשת צילומים עם מיכל · ${data.contact_name}`,
        body: {
          booking_id: booking.id,
          date: data.session_date,
          start_time: data.start_time,
          hours: data.hours,
          price,
          phone: data.contact_phone,
          location: data.location,
          session_type: data.session_type ?? null,
        },
      });
    } catch {
      // notification failure must not block the booking
    }

    return { id: booking.id, price, end_time: endTime };
  });

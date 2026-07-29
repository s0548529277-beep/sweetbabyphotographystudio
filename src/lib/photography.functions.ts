import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PHOTOGRAPHY_HOURLY_RATE, PAYMENT_LABELS } from "@/lib/photography-options";


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
        balance_method: data.payment_method,
        reserved_items: [],
        terms_accepted_at: new Date().toISOString(),
        notes: [
          `📸 צילומים עם מיכל סיבוני (${data.location === "outdoor" ? "צילומי חוץ" : "בסטודיו"})`,
          data.session_type ? `סוג צילום: ${data.session_type}` : null,
          `אמצעי תשלום: ${PAYMENT_LABELS[data.payment_method] ?? data.payment_method}`,
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
          email: data.contact_email ?? null,
          payment_method: data.payment_method,
          location: data.location,
          session_type: data.session_type ?? null,
        },
      });
    } catch {
      // notification failure must not block the booking
    }

    // Confirmation email to the studio + the customer.
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const customerEmail = data.contact_email || userRes?.user?.email || undefined;
      const row = (label: string, value: string) =>
        `<tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>${label}</strong></td><td style="padding:6px 10px">${value}</td></tr>`;
      const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:600px;margin:auto">
        <h2 style="color:#2d3d2b">בקשת צילומים עם מיכל סיבוני 📸</h2>
        <p>שלום ${data.contact_name},</p>
        <p>הבקשה נקלטה ביומן הסטודיו. <strong>המועד מאושר סופית לאחר תיאום עם הצלמת.</strong></p>
        <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:8px">
          ${row("תאריך", data.session_date)}
          ${row("שעה", `${data.start_time} - ${endTime}`)}
          ${row("משך", `${data.hours} שעות`)}
          ${row("מיקום", data.location === "outdoor" ? "צילומי חוץ" : "בסטודיו")}
          ${data.session_type ? row("סוג צילום", String(data.session_type).replace(/</g, "&lt;")) : ""}
          ${row("עלות משוערת", `₪${price}`)}
          ${row("אמצעי תשלום", PAYMENT_LABELS[data.payment_method] ?? data.payment_method)}
          ${row("טלפון", data.contact_phone)}
          ${data.notes ? row("הערות", String(data.notes).replace(/</g, "&lt;")) : ""}
        </table>
        <p style="color:#6b8a63;font-size:13px;margin-top:16px">Sweetbaby · תלמוד ירושלמי 24, בית שמש · 054-8529277</p>
      </div>`;
      const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
      await sendStudioAndCustomer({
        customerEmail,
        subject: `בקשת צילומים · ${data.contact_name} · ${data.session_date}`,
        html,
      });
    } catch (e) {
      console.error("[SWEETBABY] photography email failed", e);
    }

    return { id: booking.id, price, end_time: endTime };

  });

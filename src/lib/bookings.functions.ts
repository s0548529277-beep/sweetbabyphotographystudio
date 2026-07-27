import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Studio pricing rules
// - Minimum 2 half-hour slots (1 hour)
// - First hour (2 slots): 120₪
// - Every extra hour (2 slots): 90₪
// - Half-hour = half of that rate
// - Morning package: date 08:00→11:00 (3 hours = 6 slots) → 240₪ flat
export function computeStudioPrice(slots: number, startTime: string): number {
  if (slots < 2) throw new Error("מינימום שעה (2 חצאי שעות)");
  // Morning package: starts 08:00 and exactly 6 slots (3 hours), ends by 13:00
  const [h, m] = startTime.split(":").map(Number);
  const startMinutes = h * 60 + m;
  const endMinutes = startMinutes + slots * 30;
  if (slots === 6 && startMinutes === 8 * 60 && endMinutes <= 13 * 60) return 240;

  // Standard: 60₪ per first-hour slot (slots 1-2), 45₪ per extra slot
  const firstHourSlots = Math.min(slots, 2);
  const extraSlots = slots - firstHourSlots;
  return firstHourSlots * 60 + extraSlots * 45;
}

const inputSchema = z.object({
  session_date: z.string().min(10),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  slots: z.number().int().min(2).max(30),
  contact_name: z.string().min(1).max(120),
  contact_phone: z.string().min(5).max(40),
  notes: z.string().max(1000).optional().nullable(),
  reserved_items: z.array(z.string().min(1).max(24)).max(20).optional(),
  terms_accepted: z.literal(true),
});

export const placeBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // End time
    const [h, m] = data.start_time.split(":").map(Number);
    const endMin = h * 60 + m + data.slots * 30;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

    const price = computeStudioPrice(data.slots, data.start_time);
    const isMorning = data.slots === 6 && data.start_time === "08:00";

    // Overlap check
    const { data: existing, error: exErr } = await supabase
      .from("bookings")
      .select("id, start_time, end_time")
      .eq("session_date", data.session_date)
      .neq("status", "cancelled");
    if (exErr) throw new Error(exErr.message);
    const startMin = h * 60 + m;
    for (const b of existing ?? []) {
      const [bh, bm] = String(b.start_time).split(":").map(Number);
      const [eh, em] = String(b.end_time).split(":").map(Number);
      const bs = bh * 60 + bm;
      const be = eh * 60 + em;
      if (startMin < be && endMin > bs) {
        throw new Error("הזמן שבחרת כבר תפוס. בחרי שעה אחרת.");
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const sameDay = data.session_date === today;
    const deposit = sameDay ? price : 90;

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        user_id: userId,
        session_date: data.session_date,
        start_time: data.start_time,
        end_time: endTime,
        slots: data.slots,
        package: isMorning ? "morning" : "regular",
        price,
        deposit_amount: deposit,
        balance_amount: Math.max(0, price - deposit),
        status: "pending",
        deposit_status: "pending",
        notes: data.notes ?? null,
        reserved_items: data.reserved_items && data.reserved_items.length > 0 ? data.reserved_items : null,
        terms_accepted_at: new Date().toISOString(),
      })
      .select("id, price")
      .single();
    if (error || !booking) throw new Error(error?.message ?? "יצירת שריון נכשלה");

    try {
      const { createGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const startISO = `${data.session_date}T${data.start_time}:00`;
      const endISO = `${data.session_date}T${endTime}:00`;
      const event = await createGoogleCalendarEvent({
        summary: `סטודיו · ${data.contact_name}`,
        description: [
          `טלפון: ${data.contact_phone}`,
          `מחיר: ₪${price}`,
          data.notes ? `הערות: ${data.notes}` : null,
        ].filter(Boolean).join("\n"),
        startISO,
        endISO,
      });
      if (event) {
        await supabaseAdmin.from("bookings").update({ google_event_id: event.id }).eq("id", booking.id);
      }
    } catch (e) {
      // Never fail the booking itself if the calendar sync has an issue —
      // the booking is already saved; just log it for follow-up.
      console.error("[SWEETBABY] Google Calendar sync failed", e);
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("admin_notifications").insert({
        type: "booking",
        title: `שריון סטודיו חדש · ₪${price}`,
        body: {
          booking_id: booking.id,
          session_date: data.session_date,
          start_time: data.start_time,
          end_time: endTime,
          slots: data.slots,
          package: isMorning ? "morning" : "regular",
          price, deposit,
          contact_name: data.contact_name,
          contact_phone: data.contact_phone,
          notes: data.notes ?? null,
        },
      });
      console.log("[SWEETBABY] New booking", { id: booking.id, price, deposit });
    } catch (e) { console.error("[SWEETBABY] admin notify failed", e); }
// Send confirmation emails (customer + studio) from the studio's Gmail.
    // Includes the signed coordination agreement so everything arrives together.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const customerEmail = user?.email;


      // Latest signed intake for this user
      let intakeHtml = "";
      try {
        const { data: intake } = await supabase
          .from("studio_intake_forms")
          .select("payload, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const p = (intake?.payload ?? null) as Record<string, string> | null;
        if (p) {
          const labels: Array<[string, string]> = [
            ["שם מלא", "clientName"], ["טלפון", "phone"], ["אימייל", "email"],
            ["סוג הצילום", "sessionType"], ["מספר משתתפים", "peopleCount"],
            ["גיל התינוק", "babyAge"], ["מותג מצלמה", "cameraBrand"],
            ["ניסיון פלאש/סטודיו", "flashExperience"], ["אביזרים בהשכרה", "needProps"],
            ["בקשות מיוחדות", "specialRequests"],
          ];
          const rows = labels
            .filter(([, k]) => p[k] && String(p[k]).trim().length > 0)
            .map(([label, k]) =>
              `<tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>${label}</strong></td><td style="padding:6px 10px">${String(p[k]).replace(/</g, "&lt;")}</td></tr>`)
            .join("");
          intakeHtml = `<h3 style="color:#2d3d2b;margin-top:24px">הסכם תיאום ציפיות — חתום ✓</h3>
            <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:8px">${rows}</table>
            <p style="font-size:12px;color:#6b8a63">הלקוחה אישרה שקראה והסכימה לכללי הסטודיו: שעות פעילות, מחירון וחישוב שעות, מדיניות ביטולים, ניקיון, אחריות ונזקים.</p>`;
        }
      } catch (e) { console.error("[SWEETBABY] intake fetch for email failed", e); }

      if (key && lovableKey) {
        const itemsHtml = data.reserved_items && data.reserved_items.length > 0
          ? `<p><strong>אביזרים ששוריינו:</strong> ${data.reserved_items.map((s) => `#${s}`).join(", ")}</p>`
          : "";
        const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:600px;margin:auto">
          <h2 style="color:#2d3d2b">סיכום הזמנה · הסטודיו שוריין 💗</h2>
          <p>שלום ${data.contact_name},</p>
          <p>תודה שקבעת תור בסטודיו Sweetbaby. להלן סיכום מלא — הסכם, שריון, אביזרים ותשלום.</p>
          <h3 style="color:#2d3d2b">פרטי התור</h3>
          <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:8px">
            <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>תאריך</strong></td><td style="padding:6px 10px">${data.session_date}</td></tr>
            <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>שעה</strong></td><td style="padding:6px 10px">${data.start_time} - ${endTime}</td></tr>
            <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>מחיר</strong></td><td style="padding:6px 10px">₪${price}</td></tr>
            <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>מקדמה</strong></td><td style="padding:6px 10px">₪${deposit}</td></tr>
            <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>יתרה לתשלום</strong></td><td style="padding:6px 10px">₪${Math.max(0, price - deposit)}</td></tr>
            ${data.notes ? `<tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>הערות</strong></td><td style="padding:6px 10px">${String(data.notes).replace(/</g, "&lt;")}</td></tr>` : ""}
          </table>
          ${itemsHtml}
          ${intakeHtml}
          <p style="color:#6b8a63;font-size:13px;margin-top:16px">כתובת הסטודיו: תלמוד ירושלמי 24, בית שמש · לשאלות: s0548529277@gmail.com / 054-8529277</p>
        </div>`;
        const recipients = ["s0548529277@gmail.com"];
        if (customerEmail) recipients.push(customerEmail);
        for (const to of recipients) {
          const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": key,
            },
            body: JSON.stringify({
              from: "Sweetbaby <studio@sweetbabyphoto.shop>",
              to: [to],
              subject: `סיכום הזמנה #${booking.id.slice(0, 8)} · Sweetbaby`,
              html,
            }),
          }).catch((e) => { console.error("[SWEETBABY] booking resend failed", to, e); return null; });
          if (res && !res.ok) console.error("[SWEETBABY] resend error", to, res.status, await res.text());
        }
      } else {
        console.error("[SWEETBABY] booking email skipped — missing RESEND_API_KEY/LOVABLE_API_KEY");
      }
    } catch (e) {
      console.error("[SWEETBABY] booking confirmation email failed", e);
    }

    return { id: booking.id, price, deposit, balance: Math.max(0, price - deposit), end_time: endTime };
  });

// ---------- Cancellation ----------

async function deleteGoogleEvent(eventId: string) {
  const client_id = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refresh_token = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  if (!client_id || !client_secret || !refresh_token) return;
  const tokRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: "refresh_token" }),
  });
  if (!tokRes.ok) return;
  const { access_token } = (await tokRes.json()) as { access_token: string };
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${access_token}` } }
  );
}

export const cancelBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: b, error } = await supabase
      .from("bookings")
      .select("id, user_id, status, google_event_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !b) throw new Error("השריון לא נמצא");
    if (b.user_id !== userId) throw new Error("אין הרשאה לבטל שריון זה");
    if (b.status === "cancelled") return { ok: true };
    // Only pending bookings can be self-cancelled — active/confirmed/returned
    // require admin intervention so we don't free live inventory by accident.
    if (b.status !== "pending") throw new Error("לא ניתן לבטל שריון פעיל — נא לפנות לצוות הסטודיו");

    const { error: upErr } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    if ((b as { google_event_id?: string }).google_event_id) {
      try { await deleteGoogleEvent((b as { google_event_id: string }).google_event_id); }
      catch (e) { console.error("[SWEETBABY] gcal delete failed", e); }
    }
    return { ok: true };
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: o, error } = await supabase
      .from("orders")
      .select("id, user_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !o) throw new Error("ההזמנה לא נמצאה");
    if (o.user_id !== userId) throw new Error("אין הרשאה לבטל הזמנה זו");
    if (o.status === "cancelled") return { ok: true };
    // Only pending orders can be self-cancelled — once an order is active
    // (picked up), returning inventory to the pool while items are still in
    // the customer's hands would let a second customer double-book.
    if (o.status !== "pending") throw new Error("לא ניתן לבטל הזמנה פעילה — נא לפנות לצוות הסטודיו");

    // Free reserved units, then mark cancelled. Use admin client to ensure the
    // availability rows are removed regardless of policy scoping.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("item_availability").delete().eq("order_id", data.id);
    const { error: upErr } = await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

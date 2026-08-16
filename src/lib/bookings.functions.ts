import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Studio pricing rules
// - Minimum 2 half-hour slots (1 hour)
// - First hour (2 slots): 120₪
// - Every extra hour (2 slots): 90₪
// - Half-hour = half of that rate
// - Newborn morning package: 3 hours (6 slots) starting 08:00 / 09:00 / 10:00
//   and ending by 13:00 → 240₪ flat
export const MORNING_PACKAGE_STARTS = ["08:00", "09:00", "10:00"] as const;
export const MORNING_PACKAGE_PRICE = 240;

/** Paid guidance / mentoring add-ons chosen in the coordination agreement. */
export const GUIDANCE_FEES = { basic: 0, mini: 50, plus: 100, premium: 300 } as const;
export const GUIDANCE_LABELS: Record<keyof typeof GUIDANCE_FEES, string> = {
  basic: "בסיסי (חינם)",
  mini: "MINI · הדרכה טכנית קצרצרה",
  plus: "PLUS · ליווי מקצועי ראשוני",
  premium: "PREMIUM · צלמת בסטודיו — 2 סטים יפים בהתאמה אישית עד שעה",
};

export function isMorningPackage(slots: number, startTime: string): boolean {
  if (slots !== 6) return false;
  if (!MORNING_PACKAGE_STARTS.includes(startTime.slice(0, 5) as (typeof MORNING_PACKAGE_STARTS)[number])) return false;
  const [h, m] = startTime.split(":").map(Number);
  return h * 60 + m + 180 <= 13 * 60;
}

export function computeStudioPrice(slots: number, startTime: string): number {
  if (slots < 2) throw new Error("מינימום שעה (2 חצאי שעות)");
  if (isMorningPackage(slots, startTime)) return MORNING_PACKAGE_PRICE;

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
  contact_email: z.string().email().max(160).optional().nullable(),

  notes: z.string().max(1000).optional().nullable(),
  reserved_items: z.array(z.string().min(1).max(24)).max(20).optional(),
  guidance: z.string().max(60).optional().nullable(),
  coupon: z.string().max(40).optional().nullable(),

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

    const basePrice = computeStudioPrice(data.slots, data.start_time);
    const guidanceKey = (data.guidance ?? "basic") as keyof typeof GUIDANCE_FEES;
    const guidanceFee = GUIDANCE_FEES[guidanceKey] ?? 0;
    let price = basePrice + guidanceFee;

    // Optional discount code (e.g. BYBY10 / SWEETBABY10 → 10%).
    let couponNote: string | null = null;
    const couponCode = (data.coupon ?? "").trim().toUpperCase();
    if (couponCode) {
      const { data: c } = await supabase
        .from("coupons")
        .select("code, discount_percent, discount_amount, active, expires_at")
        .eq("code", couponCode)
        .maybeSingle();
      const valid = c && c.active && (!c.expires_at || new Date(c.expires_at) > new Date());
      if (!valid) throw new Error("קוד הקופון אינו תקף");
      const off = Math.min(
        price,
        Math.round((price * (Number(c!.discount_percent) || 0)) / 100 + (Number(c!.discount_amount) || 0)),
      );
      price = Math.max(0, price - off);
      couponNote = `קוד קופון ${c!.code} · הנחה ₪${off}`;
    }
    const isMorning = isMorningPackage(data.slots, data.start_time);


    // Overlap check
  const { data: existing, error: exErr } = await supabase
  .from("bookings")
  .select("id, start_time, end_time")
  .eq("session_date", data.session_date)
  .neq("status", "cancelled")
  .neq("deposit_status", "pending");
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

    // Also honour the studio owner's real Google Calendar: any non-transparent
    // event (studio session, photography session, personal block) blocks the
    // slot. Prop-rental pickups are created as transparent → they never block.
    try {
      const { listGoogleCalendarBusy } = await import("@/integrations/google/calendar.server");
      const gbusy = await listGoogleCalendarBusy(data.session_date, data.session_date);
      for (const [bs, be] of gbusy[data.session_date] ?? []) {
        if (startMin < be && endMin > bs) {
          throw new Error("הזמן שבחרת כבר תפוס ביומן הסטודיו. בחרי שעה אחרת.");
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("תפוס")) throw e;
      console.error("[SWEETBABY] calendar conflict check failed", e);
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
        contact_name: data.contact_name,
        contact_phone: data.contact_phone,
        notes: [
          guidanceFee > 0 ? `חבילת הדרכה: ${GUIDANCE_LABELS[guidanceKey]} (+₪${guidanceFee})` : null,
          couponNote,
          data.notes,

        ].filter(Boolean).join("\n") || null,
        reserved_items: data.reserved_items ?? [],
        terms_accepted_at: new Date().toISOString(),
      })
      .select("id, price")
      .single();
    if (error || !booking) throw new Error(error?.message ?? "יצירת שריון נכשלה");

    // Lock the reserved props for the session date so the separate props
    // rental catalog can't double-book the exact same items.
    if (data.reserved_items && data.reserved_items.length > 0) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: propRows } = await supabaseAdmin
          .from("items")
          .select("id, sku, stock_quantity")
          .in("sku", data.reserved_items);
        for (const it of propRows ?? []) {
          const stock = Number(it.stock_quantity ?? 1);
          for (let slot = 0; slot < stock + 4; slot++) {
            const { error: lockErr } = await supabaseAdmin.from("item_availability").insert({
              item_id: it.id,
              booking_id: booking.id,
              date: data.session_date,
              start_date: data.session_date,
              end_date: data.session_date,
              slot_index: slot,
            });
            if (!lockErr) break;
            const isConflict =
              (lockErr as { code?: string }).code === "23505" || /duplicate|unique/i.test(lockErr.message ?? "");
            if (!isConflict || slot + 1 >= stock) break;
          }
        }
      } catch (e) {
        console.error("[SWEETBABY] prop lock for booking failed", e);
      }
    }

    // Customer email — used both for the calendar invitation and the summary mail.
    let customerEmail: string | undefined = data.contact_email?.trim() || undefined;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      customerEmail = customerEmail ?? user?.email ?? undefined;

    } catch { /* ignore */ }

    // NOTE: the Google Calendar event is intentionally NOT created here.
    // The slot is only written to the studio calendar after the deposit is
    // paid (bank transfer / Bit receipt uploaded, or online card payment) —
    // see `confirmBookingDeposit` below, called from the payment page.


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
            <p style="font-size:12px;color:#6b8a63">הלקוחה אישרה שקראה והסכימה לכללי הסטודיו: מחירון וחישוב שעות, מדיניות ביטולים, ניקיון, אחריות ונזקים.</p>`;
        }
      } catch (e) { console.error("[SWEETBABY] intake fetch for email failed", e); }

      {
        const itemsHtml = data.reserved_items && data.reserved_items.length > 0
          ? `<p><strong>אביזרים ששוריינו:</strong> ${data.reserved_items.map((s) => `#${s}`).join(", ")}</p>`
          : "";
        const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:600px;margin:auto">
          <h2 style="color:#2d3d2b">בקשת השריון התקבלה 📋</h2>
          <p>שלום ${data.contact_name},</p>
          <p>קיבלנו את בקשת השריון שלך לסטודיו Sweetbaby. <strong>התאריך עדיין לא סופי</strong> — כדי לאשר ולשריין אותו בפועל, יש להשלים את תשלום המקדמה (או לצרף אסמכתא לתשלום) בעמוד הבא. ברגע שהתשלום יאושר, יישלח אליך אישור שריון נוסף.</p>
          <h3 style="color:#2d3d2b">פרטי הבקשה</h3>
          <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:8px">
            <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>תאריך</strong></td><td style="padding:6px 10px">${data.session_date}</td></tr>
            <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>שעה</strong></td><td style="padding:6px 10px">${data.start_time} - ${endTime}</td></tr>
            <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>מחיר</strong></td><td style="padding:6px 10px">₪${price}</td></tr>
            <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>מקדמה לתשלום</strong></td><td style="padding:6px 10px">₪${deposit}</td></tr>
            <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>יתרה לתשלום</strong></td><td style="padding:6px 10px">₪${Math.max(0, price - deposit)}</td></tr>
            ${data.notes ? `<tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>הערות</strong></td><td style="padding:6px 10px">${String(data.notes).replace(/</g, "&lt;")}</td></tr>` : ""}
          </table>
          ${itemsHtml}
          ${intakeHtml}
          <p style="color:#6b8a63;font-size:13px;margin-top:16px">כתובת הסטודיו: תלמוד ירושלמי 24, בית שמש · לשאלות: s0548529277@gmail.com / 054-8529277</p>
        </div>`;
        const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
        await sendStudioAndCustomer({
          customerEmail,
          subject: `בקשת שריון #${booking.id.slice(0, 8)} · Sweetbaby`,
          html,
        });
      }

    } catch (e) {
      console.error("[SWEETBABY] booking confirmation email failed", e);
    }

    return { id: booking.id, price, deposit, balance: Math.max(0, price - deposit), end_time: endTime };
  });

// ---------- Cancellation ----------

async function deleteGoogleEvent(eventId: string) {
  const { deleteGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
  await deleteGoogleCalendarEvent(eventId);
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

    // Free any props reserved through this studio booking.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("item_availability").delete().eq("booking_id", data.id);

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

// ---------- Calendar sync after the deposit is paid ----------

/**
 * Writes the studio booking into the Google Calendar. Called only once the
 * customer has actually paid the deposit (bank transfer / Bit receipt or an
 * online card payment), so unpaid holds never block the calendar.
 */
export const confirmBookingDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: b, error } = await supabase
      .from("bookings")
      .select("id, user_id, session_date, start_time, end_time, price, notes, contact_name, contact_phone, google_event_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !b) throw new Error("השריון לא נמצא");
    if (b.user_id !== userId) throw new Error("אין הרשאה");
    if (b.google_event_id) return { ok: true, already: true };

    let customerEmail: string | undefined;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      customerEmail = user?.email ?? undefined;
    } catch { /* ignore */ }

    try {
      const { createGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const event = await createGoogleCalendarEvent({
        summary: `סטודיו · ${b.contact_name ?? ""}`.trim(),
        description: [
          `טלפון: ${b.contact_phone ?? ""}`,
          `מחיר: ₪${b.price}`,
          "מקדמה שולמה ✓",
          b.notes ? `הערות: ${b.notes}` : null,
        ].filter(Boolean).join("\n"),
        startISO: `${b.session_date}T${String(b.start_time).slice(0, 5)}:00`,
        endISO: `${b.session_date}T${String(b.end_time).slice(0, 5)}:00`,
        location: "תלמוד ירושלמי 24, בית שמש",
        attendees: customerEmail ? [customerEmail] : [],
      });
      if (event) {
        await supabaseAdmin.from("bookings").update({ google_event_id: event.id }).eq("id", b.id);
      }

      // This is the actual "you're reserved" confirmation — sent only now,
      // after payment/receipt was confirmed, never earlier.
      try {
        const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:600px;margin:auto">
          <h2 style="color:#2d3d2b">התאריך שוריין ✓</h2>
          <p>שלום ${b.contact_name ?? ""},</p>
          <p>קיבלנו את התשלום/האסמכתא, והתאריך שוריין עבורך בפועל ביומן הסטודיו. מחכות לפגוש אותך!</p>
          <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:8px">
            <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>תאריך</strong></td><td style="padding:6px 10px">${b.session_date}</td></tr>
            <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>שעה</strong></td><td style="padding:6px 10px">${String(b.start_time).slice(0, 5)} - ${String(b.end_time).slice(0, 5)}</td></tr>
            <tr><td style="padding:6px 10px;color:#6b8a63;white-space:nowrap"><strong>מחיר</strong></td><td style="padding:6px 10px">₪${b.price}</td></tr>
          </table>
          <p style="color:#6b8a63;font-size:13px;margin-top:16px">כתובת הסטודיו: תלמוד ירושלמי 24, בית שמש · לשאלות: s0548529277@gmail.com / 054-8529277</p>
        </div>`;
        const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
        await sendStudioAndCustomer({
          customerEmail,
          subject: `התאריך שוריין #${b.id.slice(0, 8)} · Sweetbaby`,
          html,
        });
      } catch (e) { console.error("[SWEETBABY] deposit confirmation email failed", e); }

      return { ok: true, already: false };
    } catch (e) {
      console.error("[SWEETBABY] deposit calendar sync failed", e);
      return { ok: false, already: false };
    }
  });

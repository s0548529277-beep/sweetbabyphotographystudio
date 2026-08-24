import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { buildPropsOrderSummaryHtml, type SummaryOrderLine } from "@/lib/orderSummary";
import { releaseAbandonedItemLocks } from "@/lib/availability.server";

const lineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sku: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
});

const inputSchema = z.object({
  lines: z.array(lineSchema).min(1),
  session_date: z.string().min(10), // rental start date (יום הצילום)
  return_date: z.string().min(10), // rental end date (חובה — לפחות אותו יום)
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  contact_name: z.string().min(1).max(120),
  contact_phone: z.string().min(5).max(40),
  camera_model: z.string().min(1).max(120).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  coupon: z.string().max(40).optional().nullable(),
  use_credit: z.number().nonnegative().max(100000).optional(),
  terms_accepted: z.literal(true),
});

// Round up rental duration (in hours) to whole 24h units; min 1.
function computeDayMultiplier(startISO: string, endISO: string): number {
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  if (!isFinite(ms) || ms <= 0) return 1;
  const hours = ms / (1000 * 60 * 60);
  return Math.max(1, Math.ceil(hours / 24));
}

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const startDate = data.session_date;
    const endDate = data.return_date >= data.session_date ? data.return_date : data.session_date;

    const skus = data.lines.map((l) => l.sku);
    const { data: items, error: itemsErr } = await supabase
      .from("items")
      .select("id, name, sku, price, active, stock_quantity")
      .in("sku", skus);
    if (itemsErr) throw new Error(itemsErr.message);

    // Compute how many 24h units this rental covers. If specific times were
    // provided, use them; otherwise use full days between the two dates.
    const startISO = `${startDate}T${data.start_time ?? "09:00"}:00`;
    const endISO = `${endDate}T${data.end_time ?? data.start_time ?? "18:00"}:00`;
    const dayMultiplier = computeDayMultiplier(startISO, endISO);

    const byId = new Map(items?.map((i) => [i.sku, i]) ?? []);
    let total = 0;
    const orderLines = data.lines.map((l) => {
      const server = byId.get(l.sku);
      if (!server || !server.active) throw new Error(`פריט לא זמין: ${l.name}`);
      const basePrice = Number(server.price);
      const price = basePrice * dayMultiplier;
      total += price * l.quantity;
      return {
        item_id: server.id,
        item_name: server.name,
        item_sku: server.sku,
        quantity: l.quantity,
        price,
        stock: Number(server.stock_quantity ?? 1),
      };
    });

    if (total < 50) throw new Error("מינימום הזמנה 50 ש״ח");

    // Optional discount code (e.g. BYBY10 / SWEETBABY10 → 10%), same coupons
    // table used by studio-rental checkout.
    let couponNote: string | null = null;
    let couponCodeUsed: string | null = null;
    let couponDiscount = 0;
    let couponIdToRedeem: string | null = null;
    const couponCode = (data.coupon ?? "").trim().toUpperCase();
    if (couponCode) {
      const { data: c } = await supabase
        .from("coupons")
        .select("id, code, discount_percent, discount_amount, active, expires_at, single_use, redeemed_at")
        .eq("code", couponCode)
        .maybeSingle();
      const valid =
        c && c.active && (!c.expires_at || new Date(c.expires_at) > new Date()) && (!c.single_use || !c.redeemed_at);
      if (!valid) throw new Error("קוד הקופון אינו תקף");
      const off = Math.min(
        total,
        Math.round((total * (Number(c!.discount_percent) || 0)) / 100 + (Number(c!.discount_amount) || 0)),
      );
      total = Math.max(0, total - off);
      couponNote = `קוד קופון ${c!.code} · הנחה ₪${off}`;
      couponCodeUsed = c!.code;
      couponDiscount = off;
      if (c!.single_use) couponIdToRedeem = c!.id;
    }

    // Optional store credit from the customer's cashback loyalty balance.
    let creditUsed = 0;
    let creditNote: string | null = null;
    if (data.use_credit && data.use_credit > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { previewCreditUse } = await import("@/lib/loyalty");
      creditUsed = await previewCreditUse(supabaseAdmin, userId, data.use_credit, total);
      if (creditUsed > 0) {
        total = Math.max(0, total - creditUsed);
        creditNote = `קרדיט לקוחה · ₪${creditUsed}`;
      }
    }

    // Date-range availability check: any existing reservation whose range
    // overlaps [startDate, endDate] counts as taken for that item.
    // Free any locks left behind by abandoned orders (created, never paid,
    // never cancelled) for these exact items/dates first — otherwise a stale
    // hold both inflates this count AND blocks the retry loop below forever.
    await releaseAbandonedItemLocks(orderLines.map((l) => l.item_id), startDate, endDate);

    const { supabaseAdmin: adminForCount } = await import("@/integrations/supabase/client.server");
    const takenCount = new Map<string, number>();
    for (const l of orderLines) {
      const { data: reservedCount, error: countErr } = await adminForCount.rpc("count_item_reservations", {
        _item_id: l.item_id,
        _from: startDate,
        _to: endDate,
      });
      if (countErr) throw new Error(countErr.message);
      takenCount.set(l.item_id, reservedCount ?? 0);
    }

    for (const l of orderLines) {
      const busy = takenCount.get(l.item_id) ?? 0;
      if (busy + l.quantity > l.stock) {
        throw new Error(`הפריט "${l.item_name}" לא זמין בתאריכים שנבחרו`);
      }
    }

    // Full payment up front — no deposit split.
    const depositAmount = total;
    const balanceAmount = 0;

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        status: "pending",
        track: "props",
        total,
        session_date: data.session_date,
        scheduled_date: data.session_date,
        return_date: endDate,
        pickup_at: startISO,
        return_at: endISO,
        contact_name: data.contact_name,
        contact_phone: data.contact_phone,
        camera_model: data.camera_model ?? null,
        notes: [
          data.start_time && data.end_time
            ? `שעות השכרה: ${data.start_time}–${data.end_time} · ${dayMultiplier} יח׳ של 24ש (מכפיל x${dayMultiplier})`
            : null,
          couponNote,
          creditNote,
          data.notes,
        ].filter(Boolean).join("\n") || null,
        deposit_amount: depositAmount,
        balance_amount: balanceAmount,
        deposit_status: "pending",
        coupon_code: couponCodeUsed,
        coupon_discount: couponDiscount,
        terms_accepted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "יצירת הזמנה נכשלה");

    if (creditUsed > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { deductCredit } = await import("@/lib/loyalty");
      const { spentCashback, spentManual } = await deductCredit(supabaseAdmin, userId, creditUsed);
      // Record which bucket the credit actually came from, so a later
      // cancellation can refund into the same bucket. credit_used itself
      // is a generated column (sum of these two).
      await supabaseAdmin
        .from("orders")
        .update({ credit_used_cashback: spentCashback, credit_used_manual: spentManual })
        .eq("id", order.id);
    }

    const { error: linesErr } = await supabase.from("order_items").insert(
      orderLines.map((l) => ({
        order_id: order.id,
        item_id: l.item_id,
        item_name: l.item_name,
        item_sku: l.item_sku,
        quantity: l.quantity,
        price: l.price,
      })),
    );
    if (linesErr) throw new Error(linesErr.message);

    // Lock availability slots for the rental range. Insert row-by-row so a
    // unique-conflict on (item_id, start_date, end_date, slot_index) — from a
    // concurrent booking — is retried with the next slot_index up to `stock`.
    const insertOne = async (l: (typeof orderLines)[number]) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const start = takenCount.get(l.item_id) ?? 0;
      for (let attempt = start; attempt < l.stock + 8; attempt++) {
        const { error } = await supabaseAdmin.from("item_availability").insert({
          item_id: l.item_id,
          order_id: order.id,
          date: startDate,
          start_date: startDate,
          end_date: endDate,
          slot_index: attempt,
        });
        if (!error) {
          takenCount.set(l.item_id, attempt + 1);
          return;
        }
        // 23505 = unique_violation. Any other error is fatal.
        // Retry only on conflicts, and only while slots are theoretically free.
        const isConflict =
          (error as { code?: string }).code === "23505" || /duplicate|unique/i.test(error.message ?? "");
        if (!isConflict) throw new Error(error.message);
        // If we've exhausted stock, real conflict — no unit available.
        if (attempt + 1 >= l.stock) break;
      }
      throw new Error(`הפריט "${l.item_name}" לא זמין בתאריכים שנבחרו`);
    };

    try {
      for (const l of orderLines) {
        for (let i = 0; i < l.quantity; i++) await insertOne(l);
      }
    } catch (e) {
      // Rollback: delete inserted availability rows + order.
      await adminForCount.from("item_availability").delete().eq("order_id", order.id);
      await supabase.from("orders").delete().eq("id", order.id);
      throw e;
    }

    // Order is committed at this point — burn the single-use coupon so it
    // can't be redeemed again.
    if (couponIdToRedeem) {
      await adminForCount.from("coupons").update({ redeemed_at: new Date().toISOString() }).eq("id", couponIdToRedeem);
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("admin_notifications").insert({
        type: "order",
        title: `הזמנת אביזרים חדשה · ₪${total}`,
        body: {
          order_id: order.id,
          total,
          deposit: depositAmount,
          balance: balanceAmount,
          contact_name: data.contact_name,
          contact_phone: data.contact_phone,
          camera_model: data.camera_model ?? null,
          session_date: data.session_date,
          return_date: endDate,
          items: orderLines.map((l) => ({ sku: l.item_sku, name: l.item_name, qty: l.quantity, price: l.price })),
          notes: data.notes ?? null,
        },
      });
      console.log("[SWEETBABY] New props order", { id: order.id, total, deposit: depositAmount });
    } catch (e) {
      console.error("[SWEETBABY] admin notify failed", e);
    }

    // Send confirmation emails (customer + studio) from the studio's Gmail.
    const pickupTime = data.start_time ?? "09:00";
    const returnTime = data.end_time ?? "18:00";
    let customerEmail: string | undefined;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      customerEmail = user?.email ?? undefined;
    } catch { /* ignore */ }

    try {
      const lines: SummaryOrderLine[] = orderLines.map((l) => ({
        item_name: l.item_name,
        item_sku: l.item_sku,
        quantity: l.quantity,
        price: l.price * l.quantity,
      }));
      const html = buildPropsOrderSummaryHtml({
        heading: "בקשת הזמנה התקבלה 📦",
        intro:
          "קיבלנו את בקשת ההזמנה שלך להשכרת אביזרים מסטודיו Sweetbaby. <strong>ההזמנה עדיין לא סופית</strong> — כדי לאשר אותה בפועל, יש להשלים את התשלום (או לצרף אסמכתא לתשלום) בעמוד הבא. ברגע שהתשלום יאושר, יישלח אליך אישור הזמנה נוסף עם סיכום מלא.",
        order: {
          id: order.id,
          contact_name: data.contact_name,
          session_date: data.session_date,
          pickup_time: pickupTime,
          return_date: endDate,
          return_time: returnTime,
          total,
          notes: data.notes,
          lines,
        },
      });
      const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
      await sendStudioAndCustomer({
        customerEmail,
        subject: `בקשת הזמנה #${order.id.slice(0, 8)} · Sweetbaby`,
        html,
      });
    } catch (e) {
      console.error("[SWEETBABY] confirmation email failed", e);
    }

    // NOTE: the Google Calendar event (and its automatic invite email to the
    // customer) is intentionally NOT created here. It's created only after
    // payment is confirmed — see confirmOrderDeposit below — mirroring the
    // studio-booking flow, so the calendar invite never arrives before (or
    // instead of) the actual paid confirmation.

    return { id: order.id, total, deposit: depositAmount, balance: balanceAmount };
  });

/** Guesses a MIME type for the uploaded receipt from its file extension. */
function receiptContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    heic: "image/heic",
  };
  return map[ext] ?? "application/octet-stream";
}

/** Downloads the uploaded payment receipt from the `receipts` bucket and base64-encodes it for email attachment (best-effort). */
async function fetchReceiptAttachment(
  supabaseAdmin: any,
  path: string | null | undefined,
): Promise<{ filename: string; contentType: string; base64Data: string } | null> {
  if (!path) return null;
  try {
    const { data: blob, error } = await supabaseAdmin.storage.from("receipts").download(path);
    if (error || !blob) {
      console.error("[SWEETBABY] receipt download failed", error);
      return null;
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (const b of buf) bin += String.fromCharCode(b);
    const base64Data = btoa(bin);
    const filename = path.split("/").pop() || "receipt";
    return { filename, contentType: receiptContentType(path), base64Data };
  } catch (e) {
    console.error("[SWEETBABY] receipt attachment build failed", e);
    return null;
  }
}

/**
 * Sends the FULL "אישור הזמנה — השכרת אביזרים" confirmation email — price
 * breakdown, full item list, the chosen payment method, arrival details, and
 * the uploaded payment receipt attached as a file. Called from the payment
 * page once the customer finishes paying / attaching a receipt (any payment
 * method, cash included), mirroring `confirmBookingDeposit` for studio
 * bookings. Never throws — a mail hiccup must never block the order.
 */
export const confirmOrderDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: o, error } = await supabase
      .from("orders")
      .select(
        "id, user_id, session_date, return_date, pickup_at, return_at, total, notes, contact_name, contact_phone, camera_model, deposit_receipt_url, balance_method, confirmation_sent_at, google_event_id",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error || !o) throw new Error("ההזמנה לא נמצאה");
    if (o.user_id !== userId) throw new Error("אין הרשאה");
    if (o.confirmation_sent_at) return { ok: true, already: true };

    const { data: itemRows } = await supabase
      .from("order_items")
      .select("item_name, item_sku, quantity, price")
      .eq("order_id", o.id);
    const lines: SummaryOrderLine[] = (itemRows ?? []).map((l: any) => ({
      item_name: l.item_name,
      item_sku: l.item_sku,
      quantity: l.quantity,
      price: Number(l.price) * Number(l.quantity),
    }));

    let customerEmail: string | undefined;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      customerEmail = user?.email ?? undefined;
    } catch {
      /* ignore */
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const receiptAttachment = await fetchReceiptAttachment(supabaseAdmin, o.deposit_receipt_url as string | null);

      // Award cashback loyalty credit (if this customer is enrolled) on the
      // real amount paid, now that payment is actually confirmed.
      try {
        const { awardCashback } = await import("@/lib/loyalty");
        await awardCashback(supabaseAdmin, userId, Number(o.total));
      } catch (e) {
        console.error("[SWEETBABY] cashback award (order) failed", e);
      }

      const pickupTime = o.pickup_at
        ? new Date(o.pickup_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
        : null;
      const returnTime = o.return_at
        ? new Date(o.return_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
        : null;

      const html = buildPropsOrderSummaryHtml({
        heading: "אישור הזמנה — השכרת אביזרים ✓",
        intro:
          "קיבלנו את התשלום/האסמכתא, וההזמנה מאושרת. למטה תמצאי סיכום מלא של ההזמנה, פרטי הגעה, וקובץ האסמכתא ששלחת מצורף להמשך תיעוד. נא לתאם טלפונית שעת איסוף מדויקת · 054-8529277.",
        order: {
          id: o.id,
          contact_name: o.contact_name,
          session_date: o.session_date,
          pickup_time: pickupTime,
          return_date: o.return_date,
          return_time: returnTime,
          total: o.total,
          notes: o.notes,
          balance_method: o.balance_method,
          lines,
        },
        footerNote: receiptAttachment ? "קובץ האסמכתא שצירפת מופיע כקובץ מצורף למייל זה." : undefined,
      });

      const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
      await sendStudioAndCustomer({
        customerEmail,
        subject: `אישור הזמנה — השכרת אביזרים #${o.id.slice(0, 8)} · Sweetbaby`,
        html,
        attachments: receiptAttachment ? [receiptAttachment] : undefined,
      });

      await supabaseAdmin.from("orders").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", o.id);
    } catch (e) {
      console.error("[SWEETBABY] order confirmation email failed", e);
    }

    // Add the props pickup to the studio's Google Calendar — only now, after
    // payment is confirmed, so the (unstyled) Google invite email never
    // arrives before or instead of our own branded confirmation. Marked
    // "transparent" so it shows as free time and never blocks studio-rental
    // availability.
    if (!o.google_event_id) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { createGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
        const { data: itemRows2 } = await supabase
          .from("order_items")
          .select("item_name, item_sku, quantity")
          .eq("order_id", o.id);
        const pickupTime = o.pickup_at
          ? new Date(o.pickup_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
          : "09:00";
        const returnTime = o.return_at
          ? new Date(o.return_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
          : "18:00";
        const event = await createGoogleCalendarEvent({
          summary: `איסוף אביזרים · ${o.contact_name ?? ""}`,
          description: [
            `טלפון: ${o.contact_phone ?? ""}`,
            `איסוף: ${o.session_date} ${pickupTime} · החזרה: ${o.return_date} ${returnTime}`,
            `סה״כ: ₪${o.total}`,
            o.camera_model ? `מצלמה: ${o.camera_model}` : null,
            (itemRows2 ?? []).length
              ? `אביזרים: ${(itemRows2 ?? []).map((l: any) => `${l.item_sku} ${l.item_name} ×${l.quantity}`).join(", ")}`
              : null,
            o.notes ? `הערות: ${o.notes}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          startISO: `${o.pickup_at ?? `${o.session_date}T${pickupTime}:00`}`,
          endISO: `${o.pickup_at ?? `${o.session_date}T${pickupTime}:00`}`.replace(
            /T\d{2}:/,
            `T${String(Math.min(23, Number(pickupTime.slice(0, 2)) + 1)).padStart(2, "0")}:`,
          ),
          location: "תלמוד ירושלמי 24, בית שמש",
          attendees: customerEmail ? [customerEmail] : [],
          transparent: true,
        });
        if (event) {
          await supabaseAdmin.from("orders").update({ google_event_id: event.id }).eq("id", o.id);
        }
      } catch (e) {
        console.error("[SWEETBABY] props calendar sync failed", e);
      }
    }

    return { ok: true, already: false };
  });

// ---------- 12-hours-before-pickup reminder email (props/equipment orders) ----------

const ORDER_REMINDER_WINDOW_MIN_HOURS = 11.5;
const ORDER_REMINDER_WINDOW_MAX_HOURS = 12.5;

/**
 * Scans for confirmed props/equipment orders whose pickup is in ~12 hours and
 * haven't had a reminder sent yet, and emails the customer a reminder (order
 * summary + arrival details). Mirrors `runDueBookingReminders` for studio
 * bookings. Meant to be called periodically by /api/send-booking-reminders.
 * Not wrapped in createServerFn/requireSupabaseAuth on purpose: this runs as
 * a trusted service job, not on behalf of a logged-in user.
 */
export async function runDueOrderReminders(): Promise<{ checked: number; sent: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const today = new Date();
  const windowEnd = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: candidates, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, user_id, session_date, return_date, pickup_at, return_at, total, notes, contact_name, balance_method, confirmation_sent_at, reminder_sent_at, status",
    )
    .is("reminder_sent_at", null)
    .neq("status", "cancelled")
    .not("confirmation_sent_at", "is", null) // only actually-confirmed (paid) orders
    .gte("session_date", today.toISOString().slice(0, 10))
    .lte("session_date", windowEnd);

  if (error) {
    console.error("[SWEETBABY] order reminder scan failed", error);
    return { checked: 0, sent: 0 };
  }

  const now = Date.now();
  let sent = 0;

  for (const o of candidates ?? []) {
    if (!o.pickup_at) continue;
    const hoursUntil = (new Date(o.pickup_at).getTime() - now) / (1000 * 60 * 60);
    if (hoursUntil < ORDER_REMINDER_WINDOW_MIN_HOURS || hoursUntil > ORDER_REMINDER_WINDOW_MAX_HOURS) continue;

    try {
      const {
        data: { user },
      } = await supabaseAdmin.auth.admin.getUserById(o.user_id);
      const customerEmail = user?.email ?? undefined;

      const { data: itemRows } = await supabaseAdmin
        .from("order_items")
        .select("item_name, item_sku, quantity, price")
        .eq("order_id", o.id);
      const lines: SummaryOrderLine[] = (itemRows ?? []).map((l: any) => ({
        item_name: l.item_name,
        item_sku: l.item_sku,
        quantity: l.quantity,
        price: Number(l.price) * Number(l.quantity),
      }));

      const pickupTime = o.pickup_at
        ? new Date(o.pickup_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
        : null;
      const returnTime = o.return_at
        ? new Date(o.return_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
        : null;

      const html = buildPropsOrderSummaryHtml({
        heading: "תזכורת: איסוף האביזרים היום ⏰",
        intro:
          "רק תזכורת חמה — איסוף האביזרים ששכרת מסטודיו Sweetbaby מתוכנן בעוד כ-12 שעות. למטה סיכום ההזמנה ופרטי ההגעה, שיהיה קל להתארגן.",
        order: {
          id: o.id,
          contact_name: o.contact_name,
          session_date: o.session_date,
          pickup_time: pickupTime,
          return_date: o.return_date,
          return_time: returnTime,
          total: o.total,
          notes: o.notes,
          balance_method: o.balance_method,
          lines,
        },
      });

      const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
      await sendStudioAndCustomer({
        customerEmail,
        subject: `תזכורת לאיסוף היום #${o.id.slice(0, 8)} · Sweetbaby`,
        html,
      });

      await supabaseAdmin.from("orders").update({ reminder_sent_at: new Date().toISOString() }).eq("id", o.id);
      sent += 1;
    } catch (e) {
      console.error("[SWEETBABY] order reminder send failed for order", o.id, e);
    }
  }

  return { checked: (candidates ?? []).length, sent };
}

// Public availability check server fn (client uses it to disable unavailable items)
const availSchema = z.object({
  skus: z.array(z.string().min(1)).min(1).max(600),
  from: z.string().min(10),
  to: z.string().min(10),
});


export const checkItemsAvailability = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => availSchema.parse(data))
  .handler(async ({ data }) => {
    // Use publishable server client — this is a public read gated by RLS on
    // item_availability (admin/owner reads only) but we only need aggregate
    // counts, so use service role via admin client but only to count rows.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const from = data.from;
    const to = data.to >= data.from ? data.to : data.from;

    const itemsRes = await supabaseAdmin.from("items").select("id, sku, stock_quantity").in("sku", data.skus);
    if (itemsRes.error) throw new Error(itemsRes.error.message);

    const items = itemsRes.data ?? [];
    const idsBySku = new Map(items.map((i) => [i.sku, i.id]));
    const stockBySku = new Map(items.map((i) => [i.sku, Number(i.stock_quantity ?? 1)]));
    const realIds = items.map((i) => i.id);

    const avail = await supabaseAdmin
      .from("item_availability")
      .select("item_id")
      .in("item_id", realIds)
      .lte("start_date", to)
      .gte("end_date", from);
    if (avail.error) throw new Error(avail.error.message);

    const busyByRealId = new Map<string, number>();
    for (const r of avail.data ?? []) busyByRealId.set(r.item_id, (busyByRealId.get(r.item_id) ?? 0) + 1);

    const result: Record<string, { stock: number; taken: number; available: number }> = {};
    for (const sku of data.skus) {
      const realId = idsBySku.get(sku);
      const s = realId ? (stockBySku.get(sku) ?? 1) : 0;
      const t = realId ? (busyByRealId.get(realId) ?? 0) : 0;
      result[sku] = { stock: s, taken: t, available: Math.max(0, s - t) };
    }
    return result;
  });

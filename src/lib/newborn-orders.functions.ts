// Admin CRUD for the newborn-package order tracker (see
// newborn-packages.ts for the package/addon/timeline-step definitions and
// /admin/newborn-packages for the UI), PLUS — further down this file — a
// small token-gated public surface for her own newborn-photography clients
// (contract email, proof gallery, selection) that deliberately does NOT
// touch the general photo_client_workflows/photo_client_images system used
// elsewhere on the site: this is a separate business, per explicit
// request, so it gets its own table (newborn_order_images) and its own
// customer-facing routes (/newborn/gallery/$token), reachable without a
// site account — just a private link mailed to her.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  NEWBORN_ADDONS,
  NEWBORN_TIMELINE_STEP_KEYS,
  findNewbornPackage,
  type NewbornPackage,
} from "@/lib/newborn-packages";
import { emailHeartImgTag } from "@/lib/page-images";
import {
  DEFAULT_NEWBORN_CONTRACT_TEMPLATE,
  NEWBORN_CONTRACT_TEMPLATE_KEY,
  fillNewbornContractPlaceholders,
  renderNewbornContractHtml,
} from "@/lib/newbornContract";
import {
  DEFAULT_BIRTH_BASKET_TEMPLATE,
  BIRTH_BASKET_TEMPLATE_KEY,
  fillBirthBasketPlaceholders,
  renderBirthBasketHtml,
} from "@/lib/birthBasketInfo";
import { PAGE_IMAGE_KEYS, resolveGalleryImages } from "@/lib/page-images";

const STUDIO_EMAIL = "s0548529277@gmail.com";
// Michal's own address for anything photography-specific (this contract
// included) — distinct from STUDIO_EMAIL above, which is the general
// studio-rental/props-order address. Confirmed directly: two real,
// separate accounts, not a typo of one another.
const NEWBORN_STUDIO_EMAIL = "m0548529277@gmail.com";
const STUDIO_PHONE = "0534181051";
const BANK_DETAILS = { bank: "12", branch: "533", account: "648912", name: "מיכל סיבוני" };
const DEPOSIT_AMOUNT = 300;

function formatHebrewDate(dateStr: string | null): string {
  if (!dateStr) return "טרם נקבע";
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    return new Intl.DateTimeFormat("he-IL", {
      weekday: "long",
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return dateStr;
  }
}

const EXTRA_PHOTO_PRICE = 35;

/**
 * Reads the admin-editable template (app_settings, key
 * NEWBORN_CONTRACT_TEMPLATE_KEY — see admin.newborn-contract-text.tsx) or
 * falls back to the shipped default, same override pattern as
 * voice-phrases.server.ts's DEFAULT_PHRASES.
 */
async function getNewbornContractTemplate(supabase: any): Promise<string> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", NEWBORN_CONTRACT_TEMPLATE_KEY)
      .maybeSingle();
    return data?.value || DEFAULT_NEWBORN_CONTRACT_TEMPLATE;
  } catch (e) {
    console.error("[SWEETBABY] newborn contract template read failed, using default", e);
    return DEFAULT_NEWBORN_CONTRACT_TEMPLATE;
  }
}

/**
 * The combined "הכנה ליום הצילומים" email — prep guide + full contract +
 * a one-click confirm link (/newborn/confirm/$token). Sent automatically
 * the moment an order is created (createNewbornOrder below) — "closing the
 * deal" — to both the client and Michal's own photography address
 * (NEWBORN_STUDIO_EMAIL), since sendStudioAndCustomer's built-in recipient
 * is the general studio address, not this one.
 */
async function buildNewbornContractHtml(
  supabase: any,
  order: {
    contact_name: string;
    session_date: string | null;
    session_time: string | null;
    package_id: string;
    total_price: number;
    access_token: string | null;
  },
): Promise<string> {
  const pkg: NewbornPackage | null = findNewbornPackage(order.package_id);
  const pkgLine = pkg
    ? `חבילה: ${pkg.name} — ${pkg.features.join(", ")}`
    : `חבילה: ${order.package_id}`;
  const confirmLink = order.access_token
    ? `https://sweetbabyphoto.shop/newborn/confirm/${order.access_token}`
    : "(קישור אישור יתעדכן בקרוב)";

  const template = await getNewbornContractTemplate(supabase);
  const filled = fillNewbornContractPlaceholders(template, {
    contact_name: order.contact_name,
    package_line: pkgLine,
    price_line: `מחיר כולל: ₪${order.total_price}`,
    extra_photo_price: String(EXTRA_PHOTO_PRICE),
    session_date_line: `תאריך הצילומים: ${formatHebrewDate(order.session_date)}`,
    session_time_line: `שעה: ${order.session_time ?? "תיקבע בתיאום"}`,
    confirm_link: confirmLink,
  });
  return renderNewbornContractHtml(filled);
}

/** Best-effort contract email on order creation — never blocks the order itself, matching every other post-create sync in this file. */
async function sendNewbornContractEmail(
  supabase: any,
  order: {
    id: string;
    contact_name: string;
    contact_email: string | null;
    session_date: string | null;
    session_time: string | null;
    package_id: string;
    total_price: number;
    access_token: string | null;
  },
) {
  try {
    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const subject = `הכנה ליום הצילומים — החוזה שלך · מיכל סיבוני 💗`;
    const html = await buildNewbornContractHtml(supabase, order);
    const recipients = [order.contact_email, NEWBORN_STUDIO_EMAIL].filter((e): e is string => !!e);
    await Promise.all(recipients.map((to) => sendGmail({ to, subject, html })));
    return true;
  } catch (e) {
    console.error("[SWEETBABY] newborn contract email failed", e);
    return false;
  }
}

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

// Keeps the order's Google Calendar event in sync with its current
// date/time/name — mirrors the exact create pattern used for public studio
// bookings (bookings.functions.ts's finalizeBookingConfirmation), just
// without waiting for a separate "deposit confirmed" step: an admin
// creating/editing this order IS the confirmation here, there's no
// customer-facing pending stage. Always best-effort — a Calendar hiccup
// must never block saving the order itself, so every failure is caught and
// logged, never thrown. Deletes the previous event (if any) before
// creating a new one rather than trying to update in place, since
// calendar.server.ts only exposes create/delete, not update — cheap and
// correct for the low write-frequency this page actually sees.
// No time set yet still gets a 10:00 default rather than skipping the sync
// entirely, so the date is at least blocked/visible on the calendar; a real
// time can be added later via edit, which re-syncs.
const DEFAULT_SESSION_TIME = "10:00";
const NEWBORN_SESSION_HOURS = 2; // typical newborn session length — a real, exact per-order duration isn't tracked anywhere yet.

/** `[startTime, endTime]` (both "HH:MM"), given a possibly-missing session_time — shared by the calendar sync and the availability-blocking sync below so the two always agree on the exact same window. */
function newbornSessionWindow(sessionTime: string | null): [string, string] {
  const start = sessionTime || DEFAULT_SESSION_TIME;
  const [h, m] = start.split(":").map(Number);
  const endMin = h * 60 + m + NEWBORN_SESSION_HOURS * 60;
  const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  return [start, end];
}

/**
 * Returns null on success (or "nothing to do" — no date set), or the real
 * error message on failure. Previously this swallowed every failure with
 * only a console.error — invisible to the admin, who just saw "created,
 * not on the calendar" with zero way to know why (a real report). Still
 * NEVER throws — a Calendar hiccup must never block saving the order
 * itself — but now the caller can surface the actual reason instead of a
 * silent gap.
 */
async function syncNewbornCalendarEvent(
  db: any,
  order: {
    id: string;
    contact_name: string;
    contact_email: string | null;
    session_date: string | null;
    session_time: string | null;
    google_event_id?: string | null;
  },
): Promise<string | null> {
  try {
    const { createGoogleCalendarEvent, deleteGoogleCalendarEvent } =
      await import("@/integrations/google/calendar.server");
    if (order.google_event_id) {
      await deleteGoogleCalendarEvent(order.google_event_id).catch(() => {});
    }
    if (!order.session_date) {
      if (order.google_event_id)
        await db
          .from("newborn_package_orders")
          .update({ google_event_id: null })
          .eq("id", order.id);
      return null;
    }
    const [time, endTime] = newbornSessionWindow(order.session_time);
    const event = await createGoogleCalendarEvent({
      summary: `ניו-בורן · ${order.contact_name}`,
      description: order.contact_email ? `מייל: ${order.contact_email}` : undefined,
      startISO: `${order.session_date}T${time}:00`,
      endISO: `${order.session_date}T${endTime}:00`,
      location: "תלמוד ירושלמי 24, בית שמש",
      attendees: order.contact_email ? [order.contact_email] : [],
    });
    if (!event) return "יצירת האירוע ביומן החזירה תוצאה ריקה";
    await db
      .from("newborn_package_orders")
      .update({ google_event_id: event.id })
      .eq("id", order.id);
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[SWEETBABY] newborn order calendar sync failed", e);
    return message;
  }
}

/**
 * THE part that actually stops a customer from renting the studio during a
 * scheduled newborn session — per explicit request ("אני רוצה שזה יסגור
 * את השעות... שאנשים לא יוכלו להשכיר את הסטודיו"). Google Calendar sync
 * above is a nice-to-have visual mirror, but studioAvailability
 * (availability.server.ts) — the function every real availability check in
 * this app calls — reads busy time from the `bookings` table directly and
 * ONLY secondarily merges in Google Calendar; it doesn't depend on that
 * connector being linked at all. So this creates a REAL row in `bookings`
 * for the order's session window, exactly like any other studio booking.
 *
 * `deposit_status` is deliberately NOT "pending": bookingBlocksSlot()
 * treats a "pending" deposit as a temporary hold that EXPIRES after
 * PENDING_HOLD_MINUTES (60) unless renewed — wrong for a newborn session an
 * admin already committed to. "not_required" (any value other than the
 * literal "pending" works) blocks permanently, matching a confirmed studio
 * booking after its deposit is paid.
 *
 * `user_id` has to be a real auth.users row (bookings.user_id is NOT
 * NULL + a foreign key) — a newborn-package customer usually has no site
 * account at all, so this uses the ADMIN'S OWN id (the one creating/editing
 * the order) rather than inventing a customer account just to satisfy the
 * constraint. It reads as "the studio owner blocked this slot herself",
 * which is exactly what's happening.
 *
 * Same delete-then-recreate approach as the calendar sync (no in-place
 * "move" primitive needed for this low write-frequency), and the same
 * "never throw, return the real error message" contract.
 */
type BookingBlockResult = {
  error: string | null;
  confirmed?: { date: string; start: string; end: string };
};

async function syncNewbornBookingBlock(
  db: any,
  adminUserId: string,
  order: {
    id: string;
    contact_name: string;
    contact_phone: string;
    session_date: string | null;
    session_time: string | null;
    total_price?: number | null;
    blocking_booking_id?: string | null;
  },
): Promise<BookingBlockResult> {
  try {
    if (order.blocking_booking_id) {
      // Supabase's query builder is PromiseLike (only `.then`, no
      // `.catch`/`.finally`) — plain `await` is correct here; a query
      // error resolves as `{ error }`, it doesn't reject the promise, so
      // there's nothing further to handle even on failure (best-effort
      // cleanup of the old row before creating its replacement below).
      await db.from("bookings").delete().eq("id", order.blocking_booking_id);
    }
    if (!order.session_date) {
      if (order.blocking_booking_id)
        await db
          .from("newborn_package_orders")
          .update({ blocking_booking_id: null })
          .eq("id", order.id);
      return { error: null };
    }
    const [start, end] = newbornSessionWindow(order.session_time);
    const { data: booking, error } = await db
      .from("bookings")
      .insert({
        user_id: adminUserId,
        session_date: order.session_date,
        start_time: start,
        end_time: end,
        slots: NEWBORN_SESSION_HOURS * 2,
        package: "newborn",
        price: order.total_price ?? 0,
        status: "confirmed",
        deposit_status: "not_required",
        deposit_amount: 0,
        balance_amount: 0,
        contact_name: order.contact_name,
        contact_phone: order.contact_phone,
        notes: `חסימת יומן אוטומטית — הזמנת חבילת ניו-בורן (מזהה ${order.id.slice(0, 8)})`,
      })
      .select("id")
      .single();
    if (error || !booking)
      return { error: error?.message ?? "יצירת חסימת השעות ביומן הסטודיו נכשלה" };
    // Best-effort link-back — if blocking_booking_id itself isn't live on
    // this database yet (same schema-deploy-lag class as session_time/
    // birth_basket_used), the actual blocking booking row above was still
    // created successfully (that's what really stops a double-booking), so
    // this is reported as success regardless; only future re-sync/cleanup
    // on this specific order loses track of which booking row to replace.
    const { error: linkError } = await db
      .from("newborn_package_orders")
      .update({ blocking_booking_id: booking.id })
      .eq("id", order.id);
    if (linkError)
      console.error(
        "[SWEETBABY] newborn order booking-block created but link-back failed (likely missing column)",
        linkError,
      );
    // Reads the row back with a FRESH, independent select — not just
    // trusting the insert's own .select() response — so a genuine
    // "created but somehow not visible again" case (RLS oddity, replica
    // lag) is caught here instead of reporting a false success. Added
    // after a real report of the block silently not showing up anywhere.
    const { data: verify, error: verifyError } = await db
      .from("bookings")
      .select("id, session_date, start_time, end_time")
      .eq("id", booking.id)
      .maybeSingle();
    if (verifyError || !verify) {
      return {
        error: `נוצר (מזהה ${booking.id.slice(0, 8)}) אבל קריאה חוזרת מיד אחרי נכשלה: ${verifyError?.message ?? "לא נמצא"}`,
      };
    }
    return {
      error: null,
      confirmed: {
        date: verify.session_date,
        start: String(verify.start_time).slice(0, 5),
        end: String(verify.end_time).slice(0, 5),
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[SWEETBABY] newborn order booking-block sync failed", e);
    return { error: message };
  }
}

// newborn_package_orders is a very recent table — cast past the generated
// types until they're regenerated against the live schema (same pattern
// used for bot_knowledge_notes/image_hash elsewhere in this codebase).

export const listNewbornOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const createSchema = z.object({
  package_id: z.string().min(1),
  addon_ids: z.array(z.string()).default([]),
  contact_name: z.string().trim().min(1).max(120),
  contact_phone: z.string().trim().min(5).max(40),
  contact_email: z.string().trim().email().max(160).optional().or(z.literal("")).nullable(),
  session_date: z.string().min(10).max(10).optional().nullable(), // "YYYY-MM-DD"
  session_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  birth_basket_used: z.boolean().optional().default(false),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const createNewbornOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const pkg = findNewbornPackage(data.package_id);
    if (!pkg) throw new Error("חבילה לא מוכרת");
    const chosenAddons = NEWBORN_ADDONS.filter((a) => data.addon_ids.includes(a.id));
    const addonsPrice = chosenAddons.reduce((sum, a) => sum + a.price, 0);
    const payload = {
      package_id: pkg.id,
      addons: chosenAddons,
      base_price: pkg.price,
      addons_price: addonsPrice,
      total_price: pkg.price + addonsPrice,
      contact_name: data.contact_name,
      contact_phone: data.contact_phone,
      contact_email: data.contact_email || null,
      session_date: data.session_date || null,
      session_time: data.session_time || null,
      birth_basket_used: data.birth_basket_used ?? false,
      notes: data.notes || null,
    };
    let { data: row, error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .insert(payload)
      .select("*")
      .single();
    let schemaFallback = false;
    if (error) {
      // session_time/birth_basket_used are recently added columns — if this
      // deployment's database migration hasn't actually landed yet, the
      // WHOLE insert fails (a real report: "ההזמנה לא נשלחת, כותב שגיאה").
      // Same defensive fallback already used for draft_booking in
      // api.yemot.ivr.ts (selectVoiceSession/upsertVoiceSession) — retry
      // without the new columns so creating an order never hard-fails over
      // a schema-deploy lag; worst case the two new fields are silently
      // dropped until the migration catches up.
      console.error(
        "[SWEETBABY] newborn order insert with new columns failed, retrying without them",
        error,
      );
      const { session_time: _st, birth_basket_used: _bb, ...withoutNewCols } = payload;
      const retry = await (context.supabase as any)
        .from("newborn_package_orders")
        .insert(withoutNewCols)
        .select("*")
        .single();
      row = retry.data;
      error = retry.error;
      schemaFallback = !error;
    }
    if (error || !row) throw new Error(error?.message ?? "יצירת ההזמנה נכשלה");
    // Best-effort, never blocks the order itself — see each sync function's own doc comment.
    // bookingBlock is the one that actually stops a double-booking
    // (syncNewbornBookingBlock's own comment) — calendarError is the
    // secondary, visual-only Google Calendar mirror.
    const [calendarError, bookingBlock, contractSent] = await Promise.all([
      syncNewbornCalendarEvent(context.supabase, row),
      syncNewbornBookingBlock(context.supabase, context.userId, row),
      sendNewbornContractEmail(context.supabase, row),
    ]);
    if (contractSent) {
      // Best-effort — a stamp failure here only means the admin UI can't
      // show "נשלח" for this order, the email itself already went out.
      // supabase-js's query builder is PromiseLike-only (implements
      // .then(), not .catch()) — a bare .then().catch() throws
      // "...catch is not a function" at runtime, so this stays inside a
      // real try/catch instead (see AGENTS.md's own note on this gotcha).
      void (async () => {
        try {
          await (context.supabase as any)
            .from("newborn_package_orders")
            .update({ contract_sent_at: new Date().toISOString() })
            .eq("id", row.id);
        } catch {
          // best-effort, as documented above
        }
      })();
    }
    // `schemaFallback` tells the caller the order WAS created but the
    // shooting-time/birth-basket fields could NOT be saved (the columns
    // aren't live on this database yet) — surfaced as an honest warning in
    // the admin UI instead of silently succeeding while quietly dropping
    // what she actually typed (this is exactly why the calendar event can
    // end up at the default 10:00 instead of the real chosen time: the time
    // never made it into the row for syncNewbornCalendarEvent to read).
    // `_bookingBlockConfirmed` carries back the ACTUAL date/time read from a
    // fresh, independent select right after insert (syncNewbornBookingBlock's
    // own doc comment) — real proof for the admin UI, not just "trust me".
    return {
      ...row,
      _schemaFallback: schemaFallback,
      _calendarError: calendarError,
      _bookingBlockError: bookingBlock.error,
      _bookingBlockConfirmed: bookingBlock.confirmed ?? null,
      _contractSent: contractSent,
    };
  });

const toggleSchema = z.object({
  id: z.string().uuid(),
  step_key: z.enum(NEWBORN_TIMELINE_STEP_KEYS as [string, ...string[]]),
  done: z.boolean(),
});

/** Marks one pipeline step done/not-done — the column name is built from a zod-enum-validated whitelist (NEWBORN_TIMELINE_STEP_KEYS), never raw client input, before ever touching the query. */
export const toggleNewbornOrderStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => toggleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const column = `${data.step_key}_at`;
    const { error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .update({ [column]: data.done ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const updateContactSchema = z.object({
  id: z.string().uuid(),
  contact_name: z.string().trim().min(1).max(120).optional(),
  contact_phone: z.string().trim().min(5).max(40).optional(),
  contact_email: z
    .string()
    .trim()
    .email()
    .max(160)
    .optional()
    .or(z.literal(""))
    .nullable()
    .optional(),
  session_date: z.string().min(10).max(10).optional().nullable(),
  session_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  birth_basket_used: z.boolean().optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

// Fields that, if changed, mean the calendar event AND the availability-
// blocking booking (if either exists) need re-syncing — everything both of
// them actually depend on.
const CALENDAR_RELEVANT_FIELDS = new Set([
  "contact_name",
  "contact_email",
  "contact_phone",
  "session_date",
  "session_time",
]);

export const updateNewbornOrderContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateContactSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { id, ...rest } = data;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) patch[k] = k === "contact_email" && v === "" ? null : v;
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    let { error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .update(patch)
      .eq("id", id);
    let schemaFallback = false;
    if (error && ("session_time" in patch || "birth_basket_used" in patch)) {
      // Same schema-deploy-lag fallback as createNewbornOrder above — retry
      // without the possibly-missing new columns rather than failing the
      // whole save (which would also silently drop any OTHER field in the
      // same edit, e.g. a name/phone fix bundled with a time change).
      console.error(
        "[SWEETBABY] newborn order update with new columns failed, retrying without them",
        error,
      );
      const { session_time: _st, birth_basket_used: _bb, ...withoutNewCols } = patch;
      if (Object.keys(withoutNewCols).length > 0) {
        const retry = await (context.supabase as any)
          .from("newborn_package_orders")
          .update(withoutNewCols)
          .eq("id", id);
        error = retry.error;
      } else {
        error = null;
      }
      schemaFallback = !error;
    }
    if (error) throw new Error(error.message);

    let calendarError: string | null = null;
    let bookingBlock: BookingBlockResult = { error: null };
    const touchesCalendar = Object.keys(patch).some((k) => CALENDAR_RELEVANT_FIELDS.has(k));
    if (touchesCalendar) {
      // Drop session_time/blocking_booking_id from the select when either
      // isn't live yet — the read would otherwise fail outright over a
      // missing column, which would skip re-syncing EVERYTHING (including
      // the calendar, which has nothing to do with the missing field) for a
      // plain name/date change.
      const baseCols =
        "id, contact_name, contact_phone, contact_email, session_date, total_price, google_event_id";
      let { data: fresh } = await (context.supabase as any)
        .from("newborn_package_orders")
        .select(`${baseCols}, session_time, blocking_booking_id`)
        .eq("id", id)
        .maybeSingle();
      if (!fresh) {
        const retry = await (context.supabase as any)
          .from("newborn_package_orders")
          .select(baseCols)
          .eq("id", id)
          .maybeSingle();
        fresh = retry.data;
      }
      if (fresh) {
        const freshWithTime = { ...fresh, session_time: fresh.session_time ?? null };
        [calendarError, bookingBlock] = await Promise.all([
          syncNewbornCalendarEvent(context.supabase, freshWithTime),
          syncNewbornBookingBlock(context.supabase, context.userId, freshWithTime),
        ]);
      }
    }
    // See createNewbornOrder's matching comments — _schemaFallback,
    // _calendarError and _bookingBlockError tell the admin UI exactly what
    // didn't save/sync, instead of silently reporting success while
    // quietly dropping something she just typed or failing to block the
    // slot. _bookingBlockConfirmed is real proof (a fresh independent
    // read-back), not just "the insert didn't error".
    return {
      ok: true,
      _schemaFallback: schemaFallback,
      _calendarError: calendarError,
      _bookingBlockError: bookingBlock.error,
      _bookingBlockConfirmed: bookingBlock.confirmed ?? null,
    };
  });

export const deleteNewbornOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    // blocking_booking_id is a newer column than google_event_id — select
    // with a fallback so a missing column doesn't also break the
    // already-working google_event_id cleanup.
    let { data: existing } = await (context.supabase as any)
      .from("newborn_package_orders")
      .select("google_event_id, blocking_booking_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) {
      const retry = await (context.supabase as any)
        .from("newborn_package_orders")
        .select("google_event_id")
        .eq("id", data.id)
        .maybeSingle();
      existing = retry.data;
    }
    const { error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (existing?.google_event_id) {
      // Best-effort — an order that's already deleted shouldn't fail the whole action over a stray calendar entry.
      import("@/integrations/google/calendar.server")
        .then(({ deleteGoogleCalendarEvent }) =>
          deleteGoogleCalendarEvent(existing.google_event_id),
        )
        .catch((e) =>
          console.error("[SWEETBABY] newborn order delete: calendar cleanup failed", e),
        );
    }
    if (existing?.blocking_booking_id) {
      // Best-effort — same reasoning: never fail the delete itself over cleanup of the now-orphaned blocking booking row.
      (context.supabase as any)
        .from("bookings")
        .delete()
        .eq("id", existing.blocking_booking_id)
        .then(({ error: delErr }: any) => {
          if (delErr)
            console.error("[SWEETBABY] newborn order delete: booking-block cleanup failed", delErr);
        });
    }
    return { ok: true };
  });

const paymentSchema = z.object({
  id: z.string().uuid(),
  amount_paid: z.number().nonnegative().max(1000000),
});

/**
 * Sets the total amount paid so far on an order (not a delta — the admin
 * types the running total, same as editing a balance field directly).
 * last_payment_at is stamped "now" every time this runs, purely so the
 * dashboard's "paid this month" stat has something to filter on — it's a
 * snapshot approximation (whichever orders were last touched this month),
 * not a real payment ledger with per-transaction history.
 */
export const updateNewbornOrderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => paymentSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .update({ amount_paid: data.amount_paid, last_payment_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Stamps gallery_opened_at (idempotent — safe to call every time "פתיחת גלריה" is clicked) so the dashboard can count how many orders actually have a gallery started. */
export const markNewbornGalleryOpened = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .update({ gallery_opened_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("gallery_opened_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------
// Admin-side image management for an order's own gallery
// (newborn_order_images) — completely separate table from the general
// photo_client_images used elsewhere on the site. The admin uploads the
// file to storage herself (client-side, same uploadToStorage/applyWatermark
// pattern as everywhere else in this app); these functions just record the
// row, so no server-side file handling is needed here.
// ---------------------------------------------------------------------

/**
 * Self-healing for "Could not find the table ... in the schema cache" —
 * PostgREST's message for a table that's real in Postgres but that its own
 * cached API schema hasn't picked up yet (same failure class already seen
 * on this project for the analytics tables — see getAnalyticsSummary in
 * analytics.functions.ts, and the reload_pgrst_schema /
 * force_postgrest_reconnect migrations). newborn_order_images is a brand
 * new table, so it's the most likely one to hit this. One retry, through a
 * live request connection, after asking Postgres to notify PostgREST
 * again — never loops, never masks a genuinely different error.
 */
async function withSchemaCacheRetry(
  client: any,
  run: () => Promise<{ data: any; error: any }>,
): Promise<{ data: any; error: any }> {
  const first = await run();
  if (!/schema cache/i.test(first.error?.message ?? "")) return first;
  await client.rpc("reload_pgrst_schema").catch(() => {});
  return run();
}

export const listNewbornOrderImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows, error } = await withSchemaCacheRetry(context.supabase, () =>
      (context.supabase as any)
        .from("newborn_order_images")
        .select("*")
        .eq("order_id", data.orderId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    );
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const addImageSchema = z.object({
  orderId: z.string().uuid(),
  kind: z.enum(["proof", "edited"]),
  url: z.string().min(1),
  storagePath: z.string().nullable().optional(),
});

export const addNewbornOrderImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addImageSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await withSchemaCacheRetry(context.supabase, () =>
      (context.supabase as any).from("newborn_order_images").insert({
        order_id: data.orderId,
        kind: data.kind,
        image_url: data.url,
        storage_path: data.storagePath ?? null,
      }),
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNewbornOrderImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row } = await (context.supabase as any)
      .from("newborn_order_images")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await withSchemaCacheRetry(context.supabase, () =>
      (context.supabase as any).from("newborn_order_images").delete().eq("id", data.id),
    );
    if (error) throw new Error(error.message);
    if (row?.storage_path) {
      (context.supabase as any).storage
        .from("items")
        .remove([row.storage_path])
        .catch(() => {});
    }
    return { ok: true };
  });

/** Best-effort resend, e.g. if the automatic send-on-create failed or she wants to remind the client to reply/confirm. */
export const resendNewbornContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: order, error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !order) throw new Error(error?.message ?? "ההזמנה לא נמצאה");
    const sent = await sendNewbornContractEmail(context.supabase, order);
    if (sent) {
      await (context.supabase as any)
        .from("newborn_package_orders")
        .update({ contract_sent_at: new Date().toISOString() })
        .eq("id", data.id);
    }
    return { ok: sent };
  });

/**
 * Loads the "הכנה ליום הצילומים" template for /admin/newborn-contract-text
 * — the admin-set override if one exists, else the shipped default, plus
 * whether it's currently customized (so the UI can offer "reset to
 * default"). Same shape/intent as listVoiceBotPhrases in
 * admin-voice-phrases.functions.ts, just for a single big text block
 * instead of many short phrases.
 */
export const getNewbornContractTemplateForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data } = await (context.supabase as any)
      .from("app_settings")
      .select("value")
      .eq("key", NEWBORN_CONTRACT_TEMPLATE_KEY)
      .maybeSingle();
    const value = (data as any)?.value as string | undefined;
    return {
      value: value ?? DEFAULT_NEWBORN_CONTRACT_TEMPLATE,
      isDefault: value === undefined,
      defaultValue: DEFAULT_NEWBORN_CONTRACT_TEMPLATE,
    };
  });

export const updateNewbornContractTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ value: z.string().min(1).max(20000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any).from("app_settings").upsert(
      {
        key: NEWBORN_CONTRACT_TEMPLATE_KEY,
        value: data.value,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Deletes the override row so the template goes back to the shipped default. */
export const resetNewbornContractTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("app_settings")
      .delete()
      .eq("key", NEWBORN_CONTRACT_TEMPLATE_KEY);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------
// Token-gated PUBLIC surface — the only part of this file reachable
// without a site login. The token itself (newborn_package_orders.
// access_token) is the only credential: nothing here uses Supabase Auth,
// so every handler below reaches the database with the service-role
// client (supabaseAdmin) and validates the token itself before doing
// anything. Used by /newborn/gallery/$token (a standalone, unbranded-as-
// Sweetbaby page — see that route).
// ---------------------------------------------------------------------

async function orderByToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("newborn_package_orders")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();
  if (error || !data) return null;
  return data as any;
}

/**
 * The "קראתי ואני מאשרת" one-click confirmation — /newborn/confirm/$token.
 * Idempotent (a second click/visit is a no-op, same pattern as
 * finishNewbornProofSelectionByToken below): the stamp only happens once,
 * and Michal gets a notify email only on the first real confirmation.
 */
export const getNewbornContractStatusByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const order = await orderByToken(data.token);
    if (!order) throw new Error("קישור לא תקין");
    return {
      contactName: order.contact_name as string,
      confirmedAt: order.contract_confirmed_at as string | null,
    };
  });

export const confirmNewbornContractByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const order = await orderByToken(data.token);
    if (!order) throw new Error("קישור לא תקין");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const alreadyConfirmed = !!order.contract_confirmed_at;
    if (!alreadyConfirmed) {
      await (supabaseAdmin as any)
        .from("newborn_package_orders")
        .update({ contract_confirmed_at: new Date().toISOString() })
        .eq("id", order.id);
      try {
        const { sendGmail } = await import("@/integrations/google/gmail.server");
        const heart = await emailHeartImgTag(40);
        await sendGmail({
          to: NEWBORN_STUDIO_EMAIL,
          subject: `${order.contact_name} אישרה את החוזה! 💗`,
          html: `<div dir="rtl" style="font-family:sans-serif;color:#2d3d2b;max-width:480px;margin:0 auto;text-align:center">
            <div style="background:linear-gradient(135deg,#f5d5cf,#a8c4a2);border-radius:20px;padding:28px 20px">
              <div style="font-size:40px;margin-bottom:8px">✍️ ${heart}</div>
              <h2 style="margin:0 0 6px">${order.contact_name} קראה ואישרה את החוזה</h2>
            </div>
            <p style="margin-top:20px"><a href="https://sweetbabyphoto.shop/admin/newborn-packages" style="color:#2d3d2b;font-weight:600">לצפייה בניהול</a></p>
          </div>`,
        });
      } catch (e) {
        console.error("[SWEETBABY] newborn contract-confirmed notify failed", e);
      }
    }
    return { ok: true };
  });

export const getNewbornGalleryByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const order = await orderByToken(data.token);
    if (!order) throw new Error("קישור לא תקין");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: images } = await withSchemaCacheRetry(supabaseAdmin, () =>
      (supabaseAdmin as any)
        .from("newborn_order_images")
        .select("id, kind, image_url, selected, sort_order")
        .eq("order_id", order.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    );
    const pkg = findNewbornPackage(order.package_id);
    return {
      contactName: order.contact_name as string,
      sessionDate: order.session_date as string | null,
      packageName: pkg?.name ?? order.package_id,
      proofsSelectedAt: order.proofs_selected_at as string | null,
      images: (images ?? []) as {
        id: string;
        kind: "proof" | "edited";
        image_url: string;
        selected: boolean;
      }[],
    };
  });

export const toggleNewbornProofByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ token: z.string().min(10), imageId: z.string().uuid(), selected: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const order = await orderByToken(data.token);
    if (!order) throw new Error("קישור לא תקין");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Scope the update to this order's own images so one token can never touch another order's rows.
    const { error } = await withSchemaCacheRetry(supabaseAdmin, () =>
      (supabaseAdmin as any)
        .from("newborn_order_images")
        .update({ selected: data.selected })
        .eq("id", data.imageId)
        .eq("order_id", order.id),
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Marks the client's selection done and notifies Michal (styled email) — per explicit request. Idempotent: a second click just re-sends nothing new, the stamp only happens once. */
export const finishNewbornProofSelectionByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const order = await orderByToken(data.token);
    if (!order) throw new Error("קישור לא תקין");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const alreadyDone = !!order.proofs_selected_at;
    if (!alreadyDone) {
      await (supabaseAdmin as any)
        .from("newborn_package_orders")
        .update({ proofs_selected_at: new Date().toISOString() })
        .eq("id", order.id);
      const { data: selected } = await withSchemaCacheRetry(supabaseAdmin, () =>
        (supabaseAdmin as any)
          .from("newborn_order_images")
          .select("id")
          .eq("order_id", order.id)
          .eq("kind", "proof")
          .eq("selected", true),
      );
      try {
        const { sendGmail } = await import("@/integrations/google/gmail.server");
        const heart = await emailHeartImgTag(40);
        await sendGmail({
          to: STUDIO_EMAIL,
          subject: `${order.contact_name} סיימה לבחור תמונות! 💗`,
          html: `<div dir="rtl" style="font-family:sans-serif;color:#2d3d2b;max-width:480px;margin:0 auto;text-align:center">
            <div style="background:linear-gradient(135deg,#f5d5cf,#a8c4a2);border-radius:20px;padding:28px 20px">
              <div style="font-size:40px;margin-bottom:8px">📸 ${heart}</div>
              <h2 style="margin:0 0 6px">${order.contact_name} סיימה לבחור!</h2>
              <p style="margin:0;color:#2d3d2b/80">${selected?.length ?? 0} תמונות נבחרו</p>
            </div>
            <p style="margin-top:20px"><a href="https://sweetbabyphoto.shop/admin/newborn-packages" style="color:#2d3d2b;font-weight:600">לצפייה בניהול</a></p>
          </div>`,
        });
      } catch (e) {
        console.error("[SWEETBABY] newborn proof-selection-done notify failed", e);
      }
    }
    return { ok: true };
  });

/**
 * Reads the admin-editable birth-basket auto-reply template (app_settings,
 * key BIRTH_BASKET_TEMPLATE_KEY — see admin.birth-basket-text.tsx) or falls
 * back to the shipped default. Same override pattern as
 * getNewbornContractTemplate above, but reachable from the fully
 * unauthenticated requestBirthBasketInterest handler below, so it takes the
 * db client explicitly rather than assuming an authed `context.supabase`.
 */
async function getBirthBasketTemplate(db: any): Promise<string> {
  try {
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", BIRTH_BASKET_TEMPLATE_KEY)
      .maybeSingle();
    return data?.value || DEFAULT_BIRTH_BASKET_TEMPLATE;
  } catch (e) {
    console.error("[SWEETBABY] birth-basket template read failed, using default", e);
    return DEFAULT_BIRTH_BASKET_TEMPLATE;
  }
}

/**
 * A visitor on /newborn clicking "מעוניינת במימוש סל לידה" — a one-click
 * "I'm interested" note, not a booking. No auth needed (any site visitor,
 * logged in or not, should be able to use it). Two best-effort emails, each
 * independently caught so one failing never blocks the other: (1) to the
 * studio, with her contact details + album interest (same pattern as the
 * proof-selection-done notify above), and (2) — new — an automatic reply to
 * the visitor herself with the birth-basket packages/prices/photos, built
 * from the admin-editable template (getBirthBasketTemplate) + the "סל לידה"
 * photo gallery (PAGE_IMAGE_KEYS.birthBasket, managed at /admin/gallery).
 * Previously this only emailed the studio and — since the caller almost
 * never had name/phone/email actually filled in (they're only collected in
 * the separate booking wizard, not on this button) — usually with no
 * contact details at all, making the "click" nearly useless. Now
 * name/phone/email are required inputs, collected in their own small
 * dialog on /newborn right before this call.
 */
export const requestBirthBasketInterest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1, "נא למלא שם"),
        phone: z.string().min(1, "נא למלא טלפון"),
        email: z.string().email("נא למלא מייל תקין"),
        wants_album: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const name = data.name.trim();
    const phone = data.phone.trim();
    const email = data.email.trim();
    let studioEmailOk = false;
    try {
      const { sendGmail } = await import("@/integrations/google/gmail.server");
      const heart = await emailHeartImgTag(36);
      const contactLines = [
        `שם: ${name}`,
        `טלפון: ${phone}`,
        `מייל: ${email}`,
        `מעוניינת באלבום: ${data.wants_album ? "כן" : "לא צוין / לא"}`,
      ];
      await sendGmail({
        to: STUDIO_EMAIL,
        subject: `מעוניינת במימוש סל לידה — ${name}`,
        html: `<div dir="rtl" style="font-family:sans-serif;color:#4a3221;max-width:480px;margin:0 auto;text-align:center">
          <div style="background:linear-gradient(135deg,#f3d3dd,#ecd3ac);border-radius:20px;padding:28px 20px">
            <div style="font-size:36px;margin-bottom:8px">🧺 ${heart}</div>
            <h2 style="margin:0">מעוניינת במימוש סל לידה</h2>
          </div>
          <p style="margin-top:18px;font-size:15px">${contactLines.join("<br/>")}</p>
        </div>`,
      });
      studioEmailOk = true;
    } catch (e) {
      console.error("[SWEETBABY] birth-basket interest email to studio failed", e);
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendGmail } = await import("@/integrations/google/gmail.server");
      const [template, photoRows] = await Promise.all([
        getBirthBasketTemplate(supabaseAdmin),
        (supabaseAdmin as any)
          .from("page_images")
          .select("*")
          .eq("page", PAGE_IMAGE_KEYS.birthBasket)
          .order("sort_order", { ascending: true }),
      ]);
      const photoUrls = resolveGalleryImages(PAGE_IMAGE_KEYS.birthBasket, photoRows?.data ?? []);
      const filled = fillBirthBasketPlaceholders(template, {
        contact_name: name,
        album_line: data.wants_album
          ? "סימנת שאת מעוניינת באלבום מודפס — נכלול זאת בהצעת המחיר שאשלח."
          : "אם תרצי אלבום מודפס בנוסף לתמונות הדיגיטליות, אפשר לציין זאת ואוסיף את זה להצעת המחיר.",
      });
      await sendGmail({
        to: email,
        subject: "🧺 מימוש סל לידה אצלי — כל הפרטים | מיכל סיבוני",
        html: renderBirthBasketHtml(filled, photoUrls),
      });
    } catch (e) {
      console.error("[SWEETBABY] birth-basket auto-reply to customer failed", e);
    }

    return { ok: studioEmailOk };
  });

/**
 * Loads the birth-basket auto-reply template for /admin/birth-basket-text —
 * same shape/intent as getNewbornContractTemplateForAdmin above, just for
 * the birth-basket template key.
 */
export const getBirthBasketTemplateForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data } = await (context.supabase as any)
      .from("app_settings")
      .select("value")
      .eq("key", BIRTH_BASKET_TEMPLATE_KEY)
      .maybeSingle();
    const value = (data as any)?.value as string | undefined;
    return {
      value: value ?? DEFAULT_BIRTH_BASKET_TEMPLATE,
      isDefault: value === undefined,
      defaultValue: DEFAULT_BIRTH_BASKET_TEMPLATE,
    };
  });

export const updateBirthBasketTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ value: z.string().min(1).max(20000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any).from("app_settings").upsert(
      {
        key: BIRTH_BASKET_TEMPLATE_KEY,
        value: data.value,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Deletes the override row so the template goes back to the shipped default. */
export const resetBirthBasketTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("app_settings")
      .delete()
      .eq("key", BIRTH_BASKET_TEMPLATE_KEY);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

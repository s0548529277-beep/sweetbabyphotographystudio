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
  CM_SETTINGS_KEY,
  NEWBORN_ZIP_DOWNLOAD_LIMIT,
  fillEmailTemplate,
  parseCmSettings,
  textToEmailHtml,
} from "@/lib/client-management";

/** Editable email texts etc. (/admin/newborn-packages → הגדרות). Never throws. */
async function loadCmSettings(db: any) {
  try {
    const { data } = await db.from("app_settings").select("value").eq("key", CM_SETTINGS_KEY).maybeSingle();
    return parseCmSettings(data?.value);
  } catch {
    return parseCmSettings(null);
  }
}

/**
 * Auto-ticks a NEWBORN_TIMELINE_STEPS checkbox (`${key}_at`) the first time
 * the matching thing really happens (photos uploaded, link sent…), so she
 * doesn't have to tick it by hand. Never un-ticks, never overwrites a date
 * she set herself, never throws.
 */
async function autoTickStep(db: any, orderId: string, key: string) {
  try {
    await db
      .from("newborn_package_orders")
      .update({ [`${key}_at`]: new Date().toISOString() })
      .eq("id", orderId)
      .is(`${key}_at`, null);
  } catch (e) {
    console.error("[SWEETBABY] auto-tick step failed", key, e);
  }
}
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

// Matches the "מחירון ניו-בורן 2025" price list's "תמונה נוספת" line.
const EXTRA_PHOTO_PRICE = 40;

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
    sets_count: pkg ? String(pkg.sets) : "",
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

const updateClientStepSchema = z.object({
  id: z.string().uuid(),
  clientStep: z.number().int().min(1).max(4),
});

/**
 * Admin-only — moves the client-facing pink progress breadcrumb
 * (StepTracker.tsx, CLIENT_STEPS) on the order detail page. Deliberately
 * no gold/production-step counterpart here: NEWBORN_TIMELINE_STEPS (the
 * existing 8-step, independently-timestamped checklist above) already
 * covers that for this flow, so a second parallel "current step" number
 * would just duplicate/conflict with it rather than add anything.
 */
export const updateNewbornOrderClientStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateClientStepSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .update({ client_step: data.clientStep })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const adminAlbumDetailsSchema = z.object({
  id: z.string().uuid(),
  childName: z.string().trim().max(120).optional().or(z.literal("")),
  birthWeight: z.string().trim().max(40).optional().or(z.literal("")),
  birthTime: z.string().trim().max(20).optional().or(z.literal("")),
  birthDate: z.string().min(10).max(10).optional().or(z.literal("")),
  hospital: z.string().trim().max(120).optional().or(z.literal("")),
  captionLanguage: z.enum(["hebrew", "latin"]).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

/**
 * Admin-facing edit of the same "פרטים לעיצוב האלבום" fields the client
 * fills in on her own gallery page (submitNewbornAlbumDetailsByToken) —
 * for when she dictates the details over the phone instead, same
 * "admin can act on the client's behalf" pattern as
 * adminToggleNewbornProofSelection.
 */
export const updateNewbornAlbumDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adminAlbumDetailsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .update({
        album_child_name: data.childName?.trim() || null,
        album_birth_weight: data.birthWeight?.trim() || null,
        album_birth_time: data.birthTime?.trim() || null,
        album_birth_date: data.birthDate || null,
        album_hospital: data.hospital?.trim() || null,
        album_caption_language: data.captionLanguage || null,
        album_notes: data.notes?.trim() || null,
        album_details_submitted_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    // Same brand-new-column caveat as submitNewbornAlbumDetailsByToken above.
    if (error) {
      if (/does not exist/i.test(error.message ?? "")) {
        throw new Error("השדות החדשים האלה עדיין לא התעדכנו במסד הנתונים — נסי שוב בעוד כמה דקות.");
      }
      throw new Error(error.message);
    }
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
  // Normally set once at creation (package price + addons) — editable here
  // for when the actual agreed price differs from the catalog (e.g. a
  // verbal discount given on the phone) and the contract needs to go out
  // with the real number. Editing this does NOT change amount_paid.
  total_price: z.number().nonnegative().max(1000000).optional(),
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
    const { data: prevSchedule } = await (context.supabase as any)
      .from("newborn_package_orders")
      .select("session_date, session_time")
      .eq("id", id)
      .maybeSingle();
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

    // A moved session gets a fresh pre-session reminder (runDueClientManagementReminders).
    // Separate, best-effort update: the column comes from drizzle 0021 and must never break the save.
    if (
      prevSchedule &&
      (("session_date" in patch && patch.session_date !== prevSchedule.session_date) ||
        ("session_time" in patch &&
          String(patch.session_time ?? "").slice(0, 5) !==
            String(prevSchedule.session_time ?? "").slice(0, 5)))
    ) {
      await (context.supabase as any)
        .from("newborn_package_orders")
        .update({ reminder_sent_at: null })
        .eq("id", id);
    }

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

const newbornPaymentReminderSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(200),
});

/**
 * Bulk "מייל תשלום ללקוחות" for newborn orders — same capability/shape as
 * sendPaymentReminderEmails in photo-clients.functions.ts, ported here per
 * explicit request. Simpler than that one: contact_email lives directly on
 * the order row (no auth.users lookup needed — newborn clients have no
 * site account). Skips (never fails the whole batch on) an order with no
 * email, no price, or no open balance.
 */
export const sendNewbornPaymentReminderEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => newbornPaymentReminderSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: orders, error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .select("id, contact_name, contact_email, total_price, amount_paid")
      .in("id", data.orderIds);
    if (error) throw new Error(error.message);

    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const results = await Promise.all(
      (orders ?? []).map(async (o: any) => {
        if (!o.contact_email) return { orderId: o.id, sent: false, reason: "אין אימייל ללקוחה" };
        if (o.total_price == null)
          return { orderId: o.id, sent: false, reason: "לא הוגדר סכום כולל" };
        const balance = Number(o.total_price) - Number(o.amount_paid ?? 0);
        if (balance <= 0) return { orderId: o.id, sent: false, reason: "אין יתרה פתוחה" };
        try {
          const ok = await sendGmail({
            to: o.contact_email,
            subject: "תזכורת תשלום · מיכל סיבוני",
            html: `<div dir="rtl" style="font-family:sans-serif">
              <p>שלום${o.contact_name ? " " + o.contact_name : ""},</p>
              <p>סה״כ לתשלום: <b>₪${Number(o.total_price).toFixed(0)}</b><br/>
              שולם עד כה: <b>₪${Number(o.amount_paid ?? 0).toFixed(0)}</b><br/>
              יתרה לתשלום: <b>₪${balance.toFixed(0)}</b></p>
              <p>לתיאום התשלום אפשר להשיב למייל הזה.</p>
            </div>`,
          });
          return { orderId: o.id, sent: ok, reason: ok ? undefined : "שליחת המייל נכשלה" };
        } catch (e: any) {
          return { orderId: o.id, sent: false, reason: e?.message ?? "שליחת המייל נכשלה" };
        }
      }),
    );
    return { results };
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
  // The untouched, full-resolution upload — kept alongside the (possibly
  // compressed/watermarked) display copy above, same split as the general
  // photo_client_images system, so the client's ZIP download always has a
  // genuinely full-quality original to pull from. Omitted falls back to
  // the display copy itself.
  originalUrl: z.string().min(1).optional(),
  originalStoragePath: z.string().nullable().optional(),
  watermarked: z.boolean().optional(),
  /** The photographer's own file name (e.g. "IMG_4821.jpg") — sent back to her in the selection email. */
  fileName: z.string().max(255).optional(),
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
        original_image_url: data.originalUrl ?? data.url,
        original_storage_path: data.originalStoragePath ?? data.storagePath ?? null,
        watermarked: data.watermarked ?? false,
      }),
    );
    if (error) throw new Error(error.message);
    if (data.fileName) {
      // Separate, best-effort: file_name comes from drizzle 0022.
      await (context.supabase as any)
        .from("newborn_order_images")
        .update({ file_name: data.fileName })
        .eq("order_id", data.orderId)
        .eq("image_url", data.url);
    }
    // Uploading proofs means the shoot happened; uploading edited photos means editing is done.
    if (data.kind === "proof") await autoTickStep(context.supabase, data.orderId, "shoot_done");
    else await autoTickStep(context.supabase, data.orderId, "editing_done");
    return { ok: true };
  });

const adminToggleSchema = z.object({ imageId: z.string().uuid(), selected: z.boolean() });

/**
 * Admin-side "✓" marking on a proof photo — e.g. the client picked her
 * favorites in person/by phone rather than through the gallery link. Same
 * capability as adminToggleProofSelection in photo-clients.functions.ts,
 * ported here per explicit request that the newborn flow get the same
 * admin options the general photo-clients flow already has.
 */
export const adminToggleNewbornProofSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adminToggleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await withSchemaCacheRetry(context.supabase, () =>
      (context.supabase as any)
        .from("newborn_order_images")
        .update({ selected: data.selected })
        .eq("id", data.imageId),
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
      .select("storage_path, original_storage_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await withSchemaCacheRetry(context.supabase, () =>
      (context.supabase as any).from("newborn_order_images").delete().eq("id", data.id),
    );
    if (error) throw new Error(error.message);
    const paths = Array.from(
      new Set([row?.storage_path, row?.original_storage_path].filter(Boolean)),
    ) as string[];
    if (paths.length) {
      (context.supabase as any).storage
        .from("items")
        .remove(paths)
        .catch(() => {});
    }
    return { ok: true };
  });

/** Bulk version of deleteNewbornOrderImage — used by PhotoTriagePanel's "מחיקת המסומנות" button. */
export const bulkDeleteNewbornOrderImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows } = await (context.supabase as any)
      .from("newborn_order_images")
      .select("storage_path, original_storage_path")
      .in("id", data.ids);
    const paths = Array.from(
      new Set(
        (rows ?? []).flatMap((r: any) => [r.storage_path, r.original_storage_path]).filter(Boolean),
      ),
    ) as string[];
    const { error } = await withSchemaCacheRetry(context.supabase, () =>
      (context.supabase as any).from("newborn_order_images").delete().in("id", data.ids),
    );
    if (error) throw new Error(error.message);
    if (paths.length) {
      (context.supabase as any).storage
        .from("items")
        .remove(paths)
        .catch(() => {});
    }
    return { ok: true, deleted: data.ids.length };
  });

const photoSettingsSchema = z.object({
  id: z.string().uuid(),
  maxProofSelections: z.number().int().min(1).max(1000).nullable().optional(),
  guidedSelectionEnabled: z.boolean().optional(),
});

/** Admin-editable per-order photo-selection settings — the "מגבלת בחירה" + "מצב בחירה חכם" fields on the order gallery page, same shape/intent as updatePhotoClientDetails' equivalent fields in photo-clients.functions.ts. */
export const updateNewbornPhotoSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => photoSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const patch: Record<string, unknown> = {};
    if (data.maxProofSelections !== undefined) patch.max_proof_selections = data.maxProofSelections;
    if (data.guidedSelectionEnabled !== undefined)
      patch.guided_selection_enabled = data.guidedSelectionEnabled;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DRIVE_NEWBORN_PARENT_FOLDER = "Sweetbaby - ניו-בורן אלבומים";

/**
 * "גיבוי ושיתוף בדרייב" for a newborn order — mirrors syncAlbumToDrive in
 * photo-clients.functions.ts exactly (same drive.server.ts helpers, same
 * backup-and-share-link behavior), just reading from newborn_order_images/
 * newborn_package_orders and its own Drive parent folder so the two
 * businesses' albums never mix in Drive either.
 */
export const syncNewbornAlbumToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { uploadImageToDrive, getShareableAlbumFolderLink } =
      await import("@/integrations/google/drive.server");

    const { data: order, error: oErr } = await (supabaseAdmin as any)
      .from("newborn_package_orders")
      .select("id, contact_name")
      .eq("id", data.orderId)
      .single();
    if (oErr || !order) throw new Error(oErr?.message ?? "הזמנה לא נמצאה");

    const subFolderName = `${order.contact_name || "לקוחה"} · ${data.orderId.slice(0, 8)}`;

    const { data: images, error: imgErr } = await (supabaseAdmin as any)
      .from("newborn_order_images")
      .select("image_url, original_image_url, sort_order")
      .eq("order_id", data.orderId)
      .eq("kind", "edited")
      .order("sort_order", { ascending: true });
    if (imgErr) throw new Error(imgErr.message);
    if (!images || images.length === 0) throw new Error("אין תמונות מעובדות להעלאה");

    let uploaded = 0;
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const sourceUrl = img.original_image_url || img.image_url;
      try {
        const res = await fetch(sourceUrl);
        if (!res.ok) throw new Error(`fetch failed (${res.status})`);
        const bytes = await res.arrayBuffer();
        const contentType = res.headers.get("content-type") || "image/jpeg";
        const ext = contentType.includes("png") ? "png" : "jpg";
        await uploadImageToDrive(
          `${String(i + 1).padStart(3, "0")}.${ext}`,
          bytes,
          contentType,
          DRIVE_NEWBORN_PARENT_FOLDER,
          subFolderName,
        );
        uploaded += 1;
      } catch (e) {
        console.error(`[SWEETBABY] newborn Drive album sync: image ${i + 1} failed`, e);
      }
    }

    const link = await getShareableAlbumFolderLink(DRIVE_NEWBORN_PARENT_FOLDER, subFolderName);
    const now = new Date().toISOString();
    await (supabaseAdmin as any)
      .from("newborn_package_orders")
      .update({ drive_folder_url: link, drive_synced_at: now })
      .eq("id", data.orderId);

    return { ok: true, uploaded, total: images.length, link };
  });

/** Emails the already-synced Drive album link to the newborn client (and the studio). Refuses if syncNewbornAlbumToDrive hasn't run yet. */
/**
 * "שליחה ללקוחה" for the gallery link itself (not the Drive backup link
 * below) — per direct report that there was no way to actually send the
 * link to the client from here, only copy it manually. access_token is
 * created automatically on order creation, so this is always available.
 */
export const sendNewbornGalleryLinkByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await (supabaseAdmin as any)
      .from("newborn_package_orders")
      .select("id, contact_name, contact_email, access_token")
      .eq("id", data.orderId)
      .single();
    if (error || !order) throw new Error(error?.message ?? "הזמנה לא נמצאה");
    if (!order.access_token) throw new Error("לא נמצא קישור לגלריה הזו");
    if (!order.contact_email) throw new Error("לא נמצאה כתובת מייל ללקוחה הזו");

    const link = `https://sweetbabyphoto.shop/newborn/gallery/${order.access_token}`;
    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const settings = await loadCmSettings(supabaseAdmin);
    const text = fillEmailTemplate(settings.galleryEmailText, { שם: order.contact_name ?? "", קישור: link });
    const ok = await sendGmail({
      to: order.contact_email,
      subject: "התמונות שלך מחכות לבחירה 📸 · מיכל סיבוני",
      html: `<div dir="rtl" style="font-family:sans-serif;font-size:15px;line-height:1.7">${textToEmailHtml(text)}${
        text.includes(link) ? "" : `<p><a href="${link}">${link}</a></p>`
      }</div>`,
    });
    if (!ok) throw new Error("שליחת המייל נכשלה — בדקי את חיבור ה-Gmail של האתר");
    // Remembered for the "didn't open the gallery after 3 days" nudge; best-effort (drizzle 0022).
    await (supabaseAdmin as any)
      .from("newborn_package_orders")
      .update({ gallery_sent_at: new Date().toISOString() })
      .eq("id", order.id);
    await autoTickStep(supabaseAdmin, order.id, "photos_sent");
    return { ok: true, sentTo: order.contact_email as string };
  });

export const sendNewbornDriveAlbumLinkToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await (supabaseAdmin as any)
      .from("newborn_package_orders")
      .select("id, contact_name, contact_email, drive_folder_url")
      .eq("id", data.orderId)
      .single();
    if (error || !order) throw new Error(error?.message ?? "הזמנה לא נמצאה");
    if (!order.drive_folder_url) throw new Error("יש לבצע קודם גיבוי לדרייב");
    if (!order.contact_email) throw new Error("לא נמצאה כתובת מייל ללקוחה הזו");

    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const heart = await emailHeartImgTag(40);
    await sendGmail({
      to: order.contact_email,
      subject: "האלבום שלך בדרייב 📁 · מיכל סיבוני",
      html: `<div dir="rtl" style="font-family:sans-serif">
        <p>שלום${order.contact_name ? " " + order.contact_name : ""},</p>
        <p>האלבום המלא שלך זמין גם בגוגל דרייב, באיכות מלאה:</p>
        <p><a href="${order.drive_folder_url}">${order.drive_folder_url}</a></p>
        <p>מקווה שתאהבי ${heart}</p>
      </div>`,
    });
    await sendGmail({
      to: NEWBORN_STUDIO_EMAIL,
      subject: `קישור הדרייב נשלח ל${order.contact_name} 📁`,
      html: `<div dir="rtl" style="font-family:sans-serif"><p>${order.drive_folder_url}</p></div>`,
    });

    return { ok: true, sentTo: order.contact_email as string };
  });

// ---------- "כל התמונות בלי סימן מים" unlock (150₪ add-on) — admin side ----------
// Mirrors the same feature in photo-clients.functions.ts; see that file's
// own doc comment for the full picture. The one real difference here: the
// RECEIPT UPLOAD itself (below, in the token-gated public section) can't
// use the authenticated client-side Storage upload the main flow uses —
// a newborn client has no Supabase session at all, just the token — so it
// goes through a server function instead (submitNewbornUnlockReceiptByToken).

export const getNewbornUnlockReceiptUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await (supabaseAdmin as any)
      .from("newborn_package_orders")
      .select("unlock_receipt_path")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order?.unlock_receipt_path) return { url: null };
    const { data: signed } = await supabaseAdmin.storage
      .from("receipts")
      .createSignedUrl(order.unlock_receipt_path, 60 * 60);
    return { url: signed?.signedUrl ?? null };
  });

export const approveNewbornAllPhotosUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("newborn_package_orders")
      .update({ all_photos_unlocked: true })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
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
        .select("*")
        .eq("order_id", order.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    );
    const pkg = findNewbornPackage(order.package_id);

    // First time she opens the gallery: stamp it and tell Michal (once).
    if (!order.client_viewed_at) {
      const { error: vErr } = await (supabaseAdmin as any)
        .from("newborn_package_orders")
        .update({ client_viewed_at: new Date().toISOString() })
        .eq("id", order.id)
        .is("client_viewed_at", null);
      if (!vErr && (images ?? []).length > 0) {
        try {
          const { sendGmail } = await import("@/integrations/google/gmail.server");
          await sendGmail({
            to: NEWBORN_STUDIO_EMAIL,
            subject: `👀 ${order.contact_name} פתחה את הגלריה`,
            html: `<div dir="rtl" style="font-family:sans-serif"><p><b>${order.contact_name}</b> נכנסה עכשיו לראשונה לגלריה שלה.</p><p><a href="https://sweetbabyphoto.shop/admin/newborn-packages/${order.id}">לכרטיס הלקוחה</a></p></div>`,
          });
        } catch (e) {
          console.error("[SWEETBABY] newborn first-view notify failed", e);
        }
      }
    }

    return {
      // Full-quality originals are NEVER sent with the page — only through
      // claimNewbornZipDownload below, which checks payment + the download limit.
      downloadLimit: NEWBORN_ZIP_DOWNLOAD_LIMIT,
      proofsDownloadsLeft: Math.max(0, NEWBORN_ZIP_DOWNLOAD_LIMIT - Number(order.proofs_zip_downloads ?? 0)),
      editedDownloadsLeft: Math.max(0, NEWBORN_ZIP_DOWNLOAD_LIMIT - Number(order.edited_zip_downloads ?? 0)),
      extraPhotoPrice: EXTRA_PHOTO_PRICE,
      extraPhotosCount: Number(order.extra_photos_count ?? 0),
      contactName: order.contact_name as string,
      sessionDate: order.session_date as string | null,
      packageName: pkg?.name ?? order.package_id,
      proofsSelectedAt: order.proofs_selected_at as string | null,
      maxProofSelections: order.max_proof_selections as number | null,
      guidedSelectionEnabled: !!order.guided_selection_enabled,
      allPhotosUnlocked: !!order.all_photos_unlocked,
      unlockReceiptSubmittedAt: order.unlock_receipt_submitted_at as string | null,
      clientStep: ((order as any).client_step ?? 1) as number,
      albumDetails: {
        childName: (order as any).album_child_name as string | null,
        birthWeight: (order as any).album_birth_weight as string | null,
        birthTime: (order as any).album_birth_time as string | null,
        birthDate: (order as any).album_birth_date as string | null,
        hospital: (order as any).album_hospital as string | null,
        captionLanguage: (order as any).album_caption_language as "hebrew" | "latin" | null,
        notes: (order as any).album_notes as string | null,
        submittedAt: (order as any).album_details_submitted_at as string | null,
      },
      images: ((images ?? []) as any[]).map((img) => ({
        id: img.id as string,
        kind: img.kind as "proof" | "edited",
        image_url: img.image_url as string,
        selected: !!img.selected,
        client_note: (img.client_note ?? null) as string | null,
      })),
    };
  });

/**
 * The only way a client gets full ZIP downloads. Counts each one against
 * NEWBORN_ZIP_DOWNLOAD_LIMIT (per section: proofs / final album) because
 * storage traffic costs money, and only hands out the watermark-free
 * originals of the proofs after the 150₪ unlock was approved.
 */
export const claimNewbornZipDownload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(10), kind: z.enum(["proof_display", "proof_original", "edited"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const order = await orderByToken(data.token);
    if (!order) throw new Error("קישור לא תקין");
    if (data.kind === "proof_original" && !order.all_photos_unlocked) {
      throw new Error("ההורדה ללא סימן מים נפתחת אחרי אישור התשלום");
    }
    const counter = data.kind === "edited" ? "edited_zip_downloads" : "proofs_zip_downloads";
    const used = Number(order[counter] ?? 0);
    if (used >= NEWBORN_ZIP_DOWNLOAD_LIMIT) {
      throw new Error(`ניצלת את ${NEWBORN_ZIP_DOWNLOAD_LIMIT} ההורדות. לפתיחה מחדש אפשר לפנות אליי.`);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: images, error } = await (supabaseAdmin as any)
      .from("newborn_order_images")
      .select("*")
      .eq("order_id", order.id)
      .eq("kind", data.kind === "edited" ? "edited" : "proof")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { error: upErr } = await (supabaseAdmin as any)
      .from("newborn_package_orders")
      .update({ [counter]: used + 1 })
      .eq("id", order.id);
    if (upErr) throw new Error("ההורדה לא זמינה כרגע — נסי שוב בעוד כמה דקות");
    const photos = ((images ?? []) as any[]).map((img, i) => ({
      url: (data.kind === "proof_display" ? img.image_url : img.original_image_url || img.image_url) as string,
      name: (img.file_name as string | null) || `${String(i + 1).padStart(3, "0")}.jpg`,
    }));
    return { photos, left: NEWBORN_ZIP_DOWNLOAD_LIMIT - used - 1 };
  });

/** A short note from the client on one of her picked photos ("לקולאז'", "להבהיר"…). */
export const setNewbornImageNoteByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(10), imageId: z.string().uuid(), note: z.string().max(300) }).parse(d),
  )
  .handler(async ({ data }) => {
    const order = await orderByToken(data.token);
    if (!order) throw new Error("קישור לא תקין");
    if (order.proofs_selected_at) throw new Error("הבחירה כבר נשלחה — אפשר לכתוב לי הערות בוואטסאפ");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("newborn_order_images")
      .update({ client_note: data.note.trim() || null })
      .eq("id", data.imageId)
      .eq("order_id", order.id);
    if (error) throw new Error("שמירת ההערה נכשלה — נסי שוב בעוד כמה דקות");
    return { ok: true };
  });

/** Admin: give a client her ZIP downloads back. */
export const resetNewbornZipDownloads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("newborn_package_orders")
      .update({ proofs_zip_downloads: 0, edited_zip_downloads: 0 })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const albumDetailsSchema = z.object({
  token: z.string().min(10),
  childName: z.string().trim().max(120).optional().or(z.literal("")),
  birthWeight: z.string().trim().max(40).optional().or(z.literal("")),
  birthTime: z.string().trim().max(20).optional().or(z.literal("")),
  birthDate: z.string().min(10).max(10).optional().or(z.literal("")), // "YYYY-MM-DD"
  hospital: z.string().trim().max(120).optional().or(z.literal("")),
  captionLanguage: z.enum(["hebrew", "latin"]).optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

/**
 * "פרטים לעיצוב האלבום" — client-facing form on her own gallery page, shown
 * right after she finishes picking her proof photos (maps onto CLIENT_STEPS
 * step 3). Not locked after the first submit — she can come back and
 * correct a typo (e.g. the baby's name) any time, unlike proof selection
 * which locks for real business reasons. Advances client_step to 4 the
 * first time this is submitted, same "only moves forward" reasoning as
 * finishNewbornProofSelectionByToken.
 */
export const submitNewbornAlbumDetailsByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => albumDetailsSchema.parse(d))
  .handler(async ({ data }) => {
    const order = await orderByToken(data.token);
    if (!order) throw new Error("קישור לא תקין");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const firstSubmit = !(order as any).album_details_submitted_at;

    const { error } = await (supabaseAdmin as any)
      .from("newborn_package_orders")
      .update({
        album_child_name: data.childName?.trim() || null,
        album_birth_weight: data.birthWeight?.trim() || null,
        album_birth_time: data.birthTime?.trim() || null,
        album_birth_date: data.birthDate || null,
        album_hospital: data.hospital?.trim() || null,
        album_caption_language: data.captionLanguage ?? null,
        album_notes: data.notes?.trim() || null,
        album_details_submitted_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    // These are brand-new columns — if the migration that adds them hasn't
    // landed on the live database yet (the usual Lovable/Drizzle
    // regeneration lag), surface a clear, friendly message instead of the
    // raw "column ... does not exist" Postgres error straight to a client
    // filling in this form.
    if (error) {
      if (/does not exist/i.test(error.message ?? "")) {
        throw new Error(
          "השדות החדשים האלה עדיין לא התעדכנו באתר — נסי שוב בעוד כמה דקות, או שלחי לי את הפרטים בהודעה בינתיים.",
        );
      }
      throw new Error(error.message);
    }

    if (firstSubmit) {
      const { error: stepErr } = await (supabaseAdmin as any)
        .from("newborn_package_orders")
        .update({ client_step: 4 })
        .eq("id", order.id);
      if (stepErr)
        console.error(
          "[SWEETBABY] newborn client_step advance to 4 failed (column may not be live yet)",
          stepErr,
        );

      try {
        const { sendGmail } = await import("@/integrations/google/gmail.server");
        const captionLabel =
          data.captionLanguage === "latin"
            ? "לועזי"
            : data.captionLanguage === "hebrew"
              ? "עברי"
              : "—";
        await sendGmail({
          to: NEWBORN_STUDIO_EMAIL,
          subject: `${order.contact_name} שלחה פרטים לעיצוב האלבום 💗`,
          html: `<div dir="rtl" style="font-family:sans-serif">
            <p><b>${order.contact_name}</b> שלחה פרטים לעיצוב האלבום:</p>
            <ul>
              <li>שם הילד/ה: ${data.childName || "—"}</li>
              <li>משקל לידה: ${data.birthWeight || "—"}</li>
              <li>שעת לידה: ${data.birthTime || "—"}</li>
              <li>תאריך: ${data.birthDate || "—"}</li>
              <li>בית חולים: ${data.hospital || "—"}</li>
              <li>כיתוב: ${captionLabel}</li>
              <li>הערות: ${data.notes || "—"}</li>
            </ul>
            <p><a href="https://sweetbabyphoto.shop/admin/newborn-packages">לצפייה בניהול</a></p>
          </div>`,
        });
      } catch (e) {
        console.error("[SWEETBABY] newborn album-details notify failed", e);
      }
    }
    return { ok: true };
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
    if (order.proofs_selected_at) throw new Error("הבחירה כבר נשלחה — אי אפשר לשנות אותה יותר");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Plain (non-guided) mode keeps the original simple rule: never let her
    // exceed the limit. Guided mode allows over-selecting here on purpose
    // — the limit is only enforced once she submits (finishNewbornProof
    // SelectionByToken below) — same split as toggleProofSelection in the
    // general photo-clients flow.
    // Over-selecting is allowed in both modes now: extra photos are offered
    // for EXTRA_PHOTO_PRICE each and confirmed at finish (acceptExtra).
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
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(10), acceptExtra: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const order = await orderByToken(data.token);
    if (!order) throw new Error("קישור לא תקין");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const alreadyDone = !!order.proofs_selected_at;
    if (!alreadyDone) {
      const { data: selected } = await withSchemaCacheRetry(supabaseAdmin, () =>
        (supabaseAdmin as any)
          .from("newborn_order_images")
          .select("*")
          .eq("order_id", order.id)
          .eq("kind", "proof")
          .eq("selected", true)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
      );
      const selectedCount = selected?.length ?? 0;
      if (selectedCount === 0) throw new Error("יש לבחור לפחות תמונה אחת לפני השליחה");
      // Always enforced here regardless of guided/plain mode — the plain
      // flow never lets her exceed the limit in the first place (see
      // toggleNewbornProofByToken above), so this is a no-op there; in
      // guided mode this is the actual enforcement point.
      const extra =
        order.max_proof_selections != null ? Math.max(0, selectedCount - order.max_proof_selections) : 0;
      if (extra > 0 && !data.acceptExtra) {
        throw new Error(
          `נבחרו ${selectedCount} תמונות — ${extra} מעבר לחבילה (₪${EXTRA_PHOTO_PRICE} לתמונה). אפשר להסיר או לאשר את התוספת.`,
        );
      }
      if (extra > 0) {
        // Best-effort (extra_photos_count is drizzle 0022): the extra photos go on her bill.
        const { error: exErr } = await (supabaseAdmin as any)
          .from("newborn_package_orders")
          .update({
            extra_photos_count: extra,
            total_price: Number(order.total_price ?? 0) + extra * EXTRA_PHOTO_PRICE,
          })
          .eq("id", order.id);
        if (exErr) console.error("[SWEETBABY] newborn extra photos save failed", exErr);
      }
      // The real, load-bearing stamp (proofs_selected_at) is kept SEPARATE
      // from the client_step write below — client_step is a brand-new
      // column that may not have landed on the live database yet (the
      // usual Lovable/Drizzle migration lag), and a missing column must
      // never silently stop proofs_selected_at from being saved, which is
      // what every client is doing right now when this runs.
      const { error: stampErr } = await (supabaseAdmin as any)
        .from("newborn_package_orders")
        .update({ proofs_selected_at: new Date().toISOString() })
        .eq("id", order.id);
      if (stampErr) throw new Error(stampErr.message);

      // client_step: advance to 3 ("בחירת כיתובים, תמונות לקולאז' וכריכה")
      // — step 2 ("בחירת תמונות") is exactly what she just finished.
      // Best-effort, same reasoning as the split above.
      const { error: stepErr } = await (supabaseAdmin as any)
        .from("newborn_package_orders")
        .update({ client_step: 3 })
        .eq("id", order.id);
      if (stepErr)
        console.error(
          "[SWEETBABY] newborn client_step advance failed (column may not be live yet)",
          stepErr,
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
              <p style="margin:0;color:#2d3d2b/80">${selected?.length ?? 0} תמונות נבחרו${
                extra > 0 ? ` · כולל ${extra} תוספת (₪${extra * EXTRA_PHOTO_PRICE}, נוסף לחשבון)` : ""
              }</p>
            </div>
            <div style="text-align:right;background:#faf6f1;border-radius:14px;padding:14px 18px;margin-top:16px">
              <b>שמות הקבצים שנבחרו:</b>
              <ol style="margin:8px 0 0;padding-right:20px;line-height:1.8">${((selected ?? []) as any[])
                .map(
                  (img: any) =>
                    `<li>${String(img.file_name ?? "ללא שם (הועלתה לפני השינוי)").replace(/</g, "&lt;")}${
                      img.client_note ? ` — <i>${String(img.client_note).replace(/</g, "&lt;")}</i>` : ""
                    }</li>`,
                )
                .join("")}</ol>
              <p style="margin:10px 0 0;font-size:12px;color:#6b6b60">להעתקה לחיפוש בתוכנת העריכה:<br><code>${((selected ?? []) as any[])
                .map((img: any) => String(img.file_name ?? "").replace(/</g, "&lt;"))
                .filter(Boolean)
                .join(" ")}</code></p>
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

const MAX_RECEIPT_BASE64_LEN = 8_000_000; // ~6MB decoded — plenty for a phone-camera receipt photo, small enough to pass safely as server-fn JSON

/**
 * Token-gated "שליחת אסמכתא" for the 150₪ all-photos-unlock add-on. Unlike
 * every other image upload in this app, this one can't go straight from
 * the browser to Storage with the normal authenticated client (a newborn
 * visitor has no Supabase session, just the token) — so the file travels
 * here as base64 and gets written to Storage server-side with the
 * service-role client instead.
 */
export const submitNewbornUnlockReceiptByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(10),
        fileBase64: z.string().min(1).max(MAX_RECEIPT_BASE64_LEN),
        fileName: z.string().min(1).max(200),
        contentType: z.string().min(1).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const order = await orderByToken(data.token);
    if (!order) throw new Error("קישור לא תקין");
    if (order.all_photos_unlocked) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const ext =
      data.fileName
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "bin";
    const path = `newborn-orders/${order.id}/unlock-receipt-${Date.now()}.${ext}`;
    const bytes = Buffer.from(data.fileBase64, "base64");
    const { error: upErr } = await supabaseAdmin.storage
      .from("receipts")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (upErr) throw new Error(upErr.message);

    const now = new Date().toISOString();
    const { error } = await (supabaseAdmin as any)
      .from("newborn_package_orders")
      .update({ unlock_receipt_path: path, unlock_receipt_submitted_at: now })
      .eq("id", order.id);
    if (error) throw new Error(error.message);

    try {
      await supabaseAdmin.from("admin_notifications").insert({
        type: "newborn_unlock_receipt",
        title: `${order.contact_name} שלחה אסמכתא לפתיחת כל התמונות (150₪)`,
        body: { order_id: order.id, contact_name: order.contact_name },
      });
    } catch (e) {
      console.error("[SWEETBABY] admin_notifications write for newborn unlock receipt failed", e);
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

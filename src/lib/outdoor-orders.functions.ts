// Outdoor-shoot client gallery system — a COPY of the newborn one (newborn-orders.functions.ts),
// pointed at outdoor_package_orders / outdoor_order_images / outdoor_gallery_access, so outdoor
// clients get the same proof gallery, selection, notes, edited album, ZIP downloads, unlock receipt,
// album details, step trackers and email-code gate. Added 2026-11-04; the newborn code is untouched.
import { buildBrandedMailHtml } from "@/lib/email-draft-design";
import { withEmailHearts } from "@/lib/email-hearts";
import { createServerFn } from "@tanstack/react-start";
import { toSiteMediaUrl } from "@/lib/media-url";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { NEWBORN_TIMELINE_STEP_KEYS } from "@/lib/newborn-packages";
import { emailHeartImgTag } from "@/lib/page-images";
import { CM_SETTINGS_KEY, NEWBORN_ZIP_DOWNLOAD_LIMIT, fillEmailTemplate, parseCmSettings, textToEmailHtml } from "@/lib/client-management";

/** Editable email texts etc. (/admin/outdoor-packages → הגדרות). Never throws. */
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
      .from("outdoor_package_orders")
      .update({ [`${key}_at`]: new Date().toISOString() })
      .eq("id", orderId)
      .is(`${key}_at`, null);
  } catch (e) {
    console.error("[SWEETBABY] auto-tick step failed", key, e);
  }
}

const STUDIO_EMAIL = "s0548529277@gmail.com";

// Michal's own address for anything photography-specific (this contract
// included) — distinct from STUDIO_EMAIL above, which is the general
// studio-rental/props-order address. Confirmed directly: two real,
// separate accounts, not a typo of one another.
const OUTDOOR_STUDIO_EMAIL = "m0548529277@gmail.com";

const STUDIO_PHONE = "0534181051";

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

// Matches the "מחירון צילומי חוץ 2025" price list's "תמונה נוספת" line.
const EXTRA_PHOTO_PRICE = 40;

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

export const listOutdoorOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any)
      .from("outdoor_package_orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const toggleSchema = z.object({
  id: z.string().uuid(),
  step_key: z.enum(NEWBORN_TIMELINE_STEP_KEYS as [string, ...string[]]),
  done: z.boolean(),
});

/** Marks one pipeline step done/not-done — the column name is built from a zod-enum-validated whitelist (NEWBORN_TIMELINE_STEP_KEYS), never raw client input, before ever touching the query. */
export const toggleOutdoorOrderStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => toggleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const column = `${data.step_key}_at`;
    const { error } = await (context.supabase as any)
      .from("outdoor_package_orders")
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
export const updateOutdoorOrderClientStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateClientStepSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("outdoor_package_orders")
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
 * fills in on her own gallery page (submitOutdoorAlbumDetailsByToken) —
 * for when she dictates the details over the phone instead, same
 * "admin can act on the client's behalf" pattern as
 * adminToggleOutdoorProofSelection.
 */
export const updateOutdoorAlbumDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adminAlbumDetailsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("outdoor_package_orders")
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
    // Same brand-new-column caveat as submitOutdoorAlbumDetailsByToken above.
    if (error) {
      if (/does not exist/i.test(error.message ?? "")) {
        throw new Error("השדות החדשים האלה עדיין לא התעדכנו במסד הנתונים — נסי שוב בעוד כמה דקות.");
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });

/** Stamps gallery_opened_at (idempotent — safe to call every time "פתיחת גלריה" is clicked) so the dashboard can count how many orders actually have a gallery started. */
export const markOutdoorGalleryOpened = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("outdoor_package_orders")
      .update({ gallery_opened_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("gallery_opened_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------
// Admin-side image management for an order's own gallery
// (outdoor_order_images) — completely separate table from the general
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
 * force_postgrest_reconnect migrations). outdoor_order_images is a brand
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

export const listOutdoorOrderImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows, error } = await withSchemaCacheRetry(context.supabase, () =>
      (context.supabase as any)
        .from("outdoor_order_images")
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

export const addOutdoorOrderImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addImageSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await withSchemaCacheRetry(context.supabase, () =>
      (context.supabase as any).from("outdoor_order_images").insert({
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
        .from("outdoor_order_images")
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
export const adminToggleOutdoorProofSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adminToggleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await withSchemaCacheRetry(context.supabase, () =>
      (context.supabase as any)
        .from("outdoor_order_images")
        .update({ selected: data.selected })
        .eq("id", data.imageId),
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteOutdoorOrderImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row } = await (context.supabase as any)
      .from("outdoor_order_images")
      .select("storage_path, original_storage_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await withSchemaCacheRetry(context.supabase, () =>
      (context.supabase as any).from("outdoor_order_images").delete().eq("id", data.id),
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

/** Bulk version of deleteOutdoorOrderImage — used by PhotoTriagePanel's "מחיקת המסומנות" button. */
export const bulkDeleteOutdoorOrderImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows } = await (context.supabase as any)
      .from("outdoor_order_images")
      .select("storage_path, original_storage_path")
      .in("id", data.ids);
    const paths = Array.from(
      new Set(
        (rows ?? []).flatMap((r: any) => [r.storage_path, r.original_storage_path]).filter(Boolean),
      ),
    ) as string[];
    const { error } = await withSchemaCacheRetry(context.supabase, () =>
      (context.supabase as any).from("outdoor_order_images").delete().in("id", data.ids),
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
export const updateOutdoorPhotoSettings = createServerFn({ method: "POST" })
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
      .from("outdoor_package_orders")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DRIVE_NEWBORN_PARENT_FOLDER = "Sweetbaby - צילומי חוץ אלבומים";

/**
 * "גיבוי ושיתוף בדרייב" for a newborn order — mirrors syncAlbumToDrive in
 * photo-clients.functions.ts exactly (same drive.server.ts helpers, same
 * backup-and-share-link behavior), just reading from outdoor_order_images/
 * outdoor_package_orders and its own Drive parent folder so the two
 * businesses' albums never mix in Drive either.
 */
export const syncOutdoorAlbumToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { uploadImageToDrive, getShareableAlbumFolderLink } =
      await import("@/integrations/google/drive.server");

    const { data: order, error: oErr } = await (supabaseAdmin as any)
      .from("outdoor_package_orders")
      .select("id, contact_name")
      .eq("id", data.orderId)
      .single();
    if (oErr || !order) throw new Error(oErr?.message ?? "הזמנה לא נמצאה");

    const subFolderName = `${order.contact_name || "לקוחה"} · ${data.orderId.slice(0, 8)}`;

    const { data: images, error: imgErr } = await (supabaseAdmin as any)
      .from("outdoor_order_images")
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
      .from("outdoor_package_orders")
      .update({ drive_folder_url: link, drive_synced_at: now })
      .eq("id", data.orderId);

    return { ok: true, uploaded, total: images.length, link };
  });

/**
 * "שליחה ללקוחה" for the gallery link itself (not the Drive backup link
 * below) — per direct report that there was no way to actually send the
 * link to the client from here, only copy it manually. access_token is
 * created automatically on order creation, so this is always available.
 */
export const sendOutdoorGalleryLinkByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await (supabaseAdmin as any)
      .from("outdoor_package_orders")
      .select("id, contact_name, contact_email, access_token")
      .eq("id", data.orderId)
      .single();
    if (error || !order) throw new Error(error?.message ?? "הזמנה לא נמצאה");
    if (!order.access_token) throw new Error("לא נמצא קישור לגלריה הזו");
    if (!order.contact_email) throw new Error("לא נמצאה כתובת מייל ללקוחה הזו");

    const link = `https://sweetbabyphoto.shop/outdoor/gallery/${order.access_token}`;
    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const settings = await loadCmSettings(supabaseAdmin);
    const text = fillEmailTemplate(settings.galleryEmailText, { שם: order.contact_name ?? "", קישור: link });
    const ok = await sendGmail({
      to: order.contact_email,
      subject: "התמונות שלך מחכות לבחירה 📸 · מיכל סיבוני",
      html: withEmailHearts(
        `<div dir="rtl" style="font-family:sans-serif;font-size:15px;line-height:1.7">${textToEmailHtml(text)}${
          text.includes(link) ? "" : `<p><a href="${link}">${link}</a></p>`
        }</div>`,
        "michal",
        16,
      ),
    });
    if (!ok) throw new Error("שליחת המייל נכשלה — בדקי את חיבור ה-Gmail של האתר");
    // Remembered for the "didn't open the gallery after 3 days" nudge; best-effort (drizzle 0022).
    await (supabaseAdmin as any)
      .from("outdoor_package_orders")
      .update({ gallery_sent_at: new Date().toISOString() })
      .eq("id", order.id);
    await autoTickStep(supabaseAdmin, order.id, "photos_sent");
    return { ok: true, sentTo: order.contact_email as string };
  });

export const sendOutdoorDriveAlbumLinkToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await (supabaseAdmin as any)
      .from("outdoor_package_orders")
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
      to: OUTDOOR_STUDIO_EMAIL,
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
// goes through a server function instead (submitOutdoorUnlockReceiptByToken).

export const getOutdoorUnlockReceiptUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await (supabaseAdmin as any)
      .from("outdoor_package_orders")
      .select("unlock_receipt_path")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order?.unlock_receipt_path) return { url: null };
    const { data: signed } = await supabaseAdmin.storage
      .from("receipts")
      .createSignedUrl(order.unlock_receipt_path, 60 * 60);
    return { url: signed?.signedUrl ?? null };
  });

export const approveOutdoorAllPhotosUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("outdoor_package_orders")
      .update({ all_photos_unlocked: true })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function orderByToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("outdoor_package_orders")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();
  if (error || !data) return null;
  return data as any;
}

// ── Gallery access check (owner request 2026-10-30) ──────────────────────
// Like ChikTime: the private link alone is not enough. A device must first
// confirm a one-time code mailed to the client's address on file; it then
// gets a random device key (kept in the browser's localStorage) and is not
// asked again. Orders with no email on file keep the old link-only access so
// nobody is locked out. Codes/keys are stored hashed (table
// outdoor_gallery_access, service-role only).
const GALLERY_CODE_TTL_MIN = 15;

const GALLERY_CODE_MAX_ATTEMPTS = 5;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  const shown = user.length <= 2 ? user[0] ?? "" : user.slice(0, 2);
  return `${shown}${"•".repeat(Math.max(2, user.length - shown.length))}@${domain}`;
}

function galleryNeedsCode(order: any): boolean {
  return !!(order?.contact_email && String(order.contact_email).includes("@"));
}

async function isGalleryDeviceVerified(order: any, deviceKey: string | undefined): Promise<boolean> {
  if (!galleryNeedsCode(order)) return true;
  if (!deviceKey || deviceKey.length < 20) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = await sha256Hex(`device:${order.id}:${deviceKey}`);
  const { data } = await (supabaseAdmin as any)
    .from("outdoor_gallery_access")
    .select("id")
    .eq("order_id", order.id)
    .eq("kind", "device")
    .eq("secret_hash", hash)
    .maybeSingle();
  if (!data) return false;
  (supabaseAdmin as any)
    .from("outdoor_gallery_access")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {}, () => {});
  return true;
}

async function newGalleryDeviceKey(orderId: string, label: string): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any).from("outdoor_gallery_access").insert({
    order_id: orderId,
    kind: "device",
    secret_hash: await sha256Hex(`device:${orderId}:${key}`),
    label,
  });
  if (error) throw new Error("האימות לא נשמר — נסי שוב");
  return key;
}

/** orderByToken + the device check, for every client-gallery function. */
async function galleryOrderByToken(token: string, deviceKey: string | undefined) {
  const order = await orderByToken(token);
  if (!order) return null;
  if (!(await isGalleryDeviceVerified(order, deviceKey))) {
    throw new Error("VERIFY_REQUIRED");
  }
  return order;
}

/** Step 1 on a new device: mail a 6-digit code to the client's address on file. */
export const requestOutdoorGalleryCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const order = await orderByToken(data.token);
    if (!order) throw new Error("קישור לא תקין");
    if (!galleryNeedsCode(order)) return { sent: false, maskedEmail: null as string | null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await (supabaseAdmin as any)
      .from("outdoor_gallery_access")
      .select("created_at")
      .eq("order_id", order.id)
      .eq("kind", "code")
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    const list = (recent ?? []) as { created_at: string }[];
    if (list.length && Date.now() - new Date(list[0].created_at).getTime() < 60 * 1000) {
      throw new Error("קוד כבר נשלח עכשיו — אפשר לבקש שוב בעוד דקה");
    }
    if (list.length >= 5) throw new Error("נשלחו יותר מדי קודים. נסי שוב בעוד שעה או פני אליי.");

    const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    const { error } = await (supabaseAdmin as any).from("outdoor_gallery_access").insert({
      order_id: order.id,
      kind: "code",
      secret_hash: await sha256Hex(`code:${order.id}:${code}`),
      expires_at: new Date(Date.now() + GALLERY_CODE_TTL_MIN * 60 * 1000).toISOString(),
    });
    if (error) throw new Error("לא הצלחתי ליצור קוד — נסי שוב");

    const { sendGmail } = await import("@/integrations/google/gmail.server");
    await sendGmail({
      to: order.contact_email,
      subject: `קוד הכניסה לגלריה שלך: ${code} · מיכל סיבוני`,
      html: buildBrandedMailHtml({
        title: "קוד הכניסה לגלריה",
        innerHtml: `<div style="text-align:center">
          <p style="margin:0 0 6px;font-size:15px">שלום ${order.contact_name ?? ""},</p>
          <p style="margin:0 0 14px;font-size:14px">זה הקוד לכניסה לגלריית התמונות שלך:</p>
          <div style="font-size:34px;letter-spacing:8px;font-weight:700;color:#8a6338">${code}</div>
          <p style="margin:14px 0 0;font-size:12px;color:#8a6338">הקוד בתוקף ל-${GALLERY_CODE_TTL_MIN} דקות. אם לא ביקשת קוד, אפשר להתעלם מהמייל.</p>
        </div>`,
      }),
    });
    return { sent: true, maskedEmail: maskEmail(order.contact_email) };
  });

/** Step 2: check the code; on success the device gets a long-lived key. */
export const verifyOutdoorGalleryCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(10), code: z.string().trim().regex(/^\d{6}$/, "קוד של 6 ספרות") }).parse(d),
  )
  .handler(async ({ data }) => {
    const order = await orderByToken(data.token);
    if (!order) throw new Error("קישור לא תקין");
    if (!galleryNeedsCode(order)) return { deviceKey: null as string | null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin as any)
      .from("outdoor_gallery_access")
      .select("id, secret_hash, attempts, expires_at")
      .eq("order_id", order.id)
      .eq("kind", "code")
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("הקוד פג תוקף — בקשי קוד חדש");
    }
    if (Number(row.attempts) >= GALLERY_CODE_MAX_ATTEMPTS) {
      throw new Error("יותר מדי ניסיונות — בקשי קוד חדש");
    }
    const ok = row.secret_hash === (await sha256Hex(`code:${order.id}:${data.code}`));
    if (!ok) {
      await (supabaseAdmin as any)
        .from("outdoor_gallery_access")
        .update({ attempts: Number(row.attempts) + 1 })
        .eq("id", row.id);
      throw new Error("הקוד שגוי — נסי שוב");
    }
    await (supabaseAdmin as any)
      .from("outdoor_gallery_access")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id);
    return { deviceKey: await newGalleryDeviceKey(order.id, "client") };
  });

/** Admin preview: lets Michal open a client's gallery without mailing the client a code. */
export const createOutdoorGalleryPreviewKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    return { deviceKey: await newGalleryDeviceKey(data.orderId, "admin-preview") };
  });

export const getOutdoorGalleryByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10), deviceKey: z.string().max(200).optional() }).parse(d))
  .handler(async ({ data }) => {
    const order = await galleryOrderByToken(data.token, data.deviceKey);
    if (!order) throw new Error("קישור לא תקין");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: images } = await withSchemaCacheRetry(supabaseAdmin, () =>
      (supabaseAdmin as any)
        .from("outdoor_order_images")
        .select("*")
        .eq("order_id", order.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    );

    // First time she opens the gallery: stamp it and tell Michal (once).
    if (!order.client_viewed_at) {
      const { error: vErr } = await (supabaseAdmin as any)
        .from("outdoor_package_orders")
        .update({ client_viewed_at: new Date().toISOString() })
        .eq("id", order.id)
        .is("client_viewed_at", null);
      if (!vErr && (images ?? []).length > 0) {
        try {
          const { sendGmail } = await import("@/integrations/google/gmail.server");
          await sendGmail({
            to: OUTDOOR_STUDIO_EMAIL,
            subject: `👀 ${order.contact_name} פתחה את הגלריה`,
            html: `<div dir="rtl" style="font-family:sans-serif"><p><b>${order.contact_name}</b> נכנסה עכשיו לראשונה לגלריה שלה.</p><p><a href="https://sweetbabyphoto.shop/admin/outdoor-packages/${order.id}">לכרטיס הלקוחה</a></p></div>`,
          });
        } catch (e) {
          console.error("[SWEETBABY] newborn first-view notify failed", e);
        }
      }
    }

    return {
      // Full-quality originals are NEVER sent with the page — only through
      // claimOutdoorZipDownload below, which checks payment + the download limit.
      downloadLimit: NEWBORN_ZIP_DOWNLOAD_LIMIT,
      proofsDownloadsLeft: Math.max(0, NEWBORN_ZIP_DOWNLOAD_LIMIT - Number(order.proofs_zip_downloads ?? 0)),
      editedDownloadsLeft: Math.max(0, NEWBORN_ZIP_DOWNLOAD_LIMIT - Number(order.edited_zip_downloads ?? 0)),
      extraPhotoPrice: EXTRA_PHOTO_PRICE,
      extraPhotosCount: Number(order.extra_photos_count ?? 0),
      contactName: order.contact_name as string,
      sessionDate: order.session_date as string | null,
      packageName: (order.package_name ?? "צילומי חוץ") as string,
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
        image_url: toSiteMediaUrl(img.image_url as string),
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
export const claimOutdoorZipDownload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(10), deviceKey: z.string().max(200).optional(), kind: z.enum(["proof_display", "proof_original", "edited"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const order = await galleryOrderByToken(data.token, data.deviceKey);
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
      .from("outdoor_order_images")
      .select("*")
      .eq("order_id", order.id)
      .eq("kind", data.kind === "edited" ? "edited" : "proof")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { error: upErr } = await (supabaseAdmin as any)
      .from("outdoor_package_orders")
      .update({ [counter]: used + 1 })
      .eq("id", order.id);
    if (upErr) throw new Error("ההורדה לא זמינה כרגע — נסי שוב בעוד כמה דקות");
    const photos = ((images ?? []) as any[]).map((img, i) => ({
      url: toSiteMediaUrl((data.kind === "proof_display" ? img.image_url : img.original_image_url || img.image_url) as string),
      name: (img.file_name as string | null) || `${String(i + 1).padStart(3, "0")}.jpg`,
    }));
    return { photos, left: NEWBORN_ZIP_DOWNLOAD_LIMIT - used - 1 };
  });

/** A short note from the client on one of her picked photos ("לקולאז'", "להבהיר"…). */
export const setOutdoorImageNoteByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(10), deviceKey: z.string().max(200).optional(), imageId: z.string().uuid(), note: z.string().max(300) }).parse(d),
  )
  .handler(async ({ data }) => {
    const order = await galleryOrderByToken(data.token, data.deviceKey);
    if (!order) throw new Error("קישור לא תקין");
    if (order.proofs_selected_at) throw new Error("הבחירה כבר נשלחה — אפשר לכתוב לי הערות בוואטסאפ");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("outdoor_order_images")
      .update({ client_note: data.note.trim() || null })
      .eq("id", data.imageId)
      .eq("order_id", order.id);
    if (error) throw new Error("שמירת ההערה נכשלה — נסי שוב בעוד כמה דקות");
    return { ok: true };
  });

/** Admin: give a client her ZIP downloads back. */
export const resetOutdoorZipDownloads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("outdoor_package_orders")
      .update({ proofs_zip_downloads: 0, edited_zip_downloads: 0 })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const albumDetailsSchema = z.object({
  token: z.string().min(10),
  deviceKey: z.string().max(200).optional(),
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
 * finishOutdoorProofSelectionByToken.
 */
export const submitOutdoorAlbumDetailsByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => albumDetailsSchema.parse(d))
  .handler(async ({ data }) => {
    const order = await galleryOrderByToken(data.token, data.deviceKey);
    if (!order) throw new Error("קישור לא תקין");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const firstSubmit = !(order as any).album_details_submitted_at;

    const { error } = await (supabaseAdmin as any)
      .from("outdoor_package_orders")
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
        .from("outdoor_package_orders")
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
          to: OUTDOOR_STUDIO_EMAIL,
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
            <p><a href="https://sweetbabyphoto.shop/admin/outdoor-packages">לצפייה בניהול</a></p>
          </div>`,
        });
      } catch (e) {
        console.error("[SWEETBABY] newborn album-details notify failed", e);
      }
    }
    return { ok: true };
  });

export const toggleOutdoorProofByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ token: z.string().min(10), deviceKey: z.string().max(200).optional(), imageId: z.string().uuid(), selected: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const order = await galleryOrderByToken(data.token, data.deviceKey);
    if (!order) throw new Error("קישור לא תקין");
    if (order.proofs_selected_at) throw new Error("הבחירה כבר נשלחה — אי אפשר לשנות אותה יותר");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Plain (non-guided) mode keeps the original simple rule: never let her
    // exceed the limit. Guided mode allows over-selecting here on purpose
    // — the limit is only enforced once she submits (finishOutdoorProof
    // SelectionByToken below) — same split as toggleProofSelection in the
    // general photo-clients flow.
    // Over-selecting is allowed in both modes now: extra photos are offered
    // for EXTRA_PHOTO_PRICE each and confirmed at finish (acceptExtra).
    // Scope the update to this order's own images so one token can never touch another order's rows.
    const { error } = await withSchemaCacheRetry(supabaseAdmin, () =>
      (supabaseAdmin as any)
        .from("outdoor_order_images")
        .update({ selected: data.selected })
        .eq("id", data.imageId)
        .eq("order_id", order.id),
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Marks the client's selection done and notifies Michal (styled email) — per explicit request. Idempotent: a second click just re-sends nothing new, the stamp only happens once. */
export const finishOutdoorProofSelectionByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(10), deviceKey: z.string().max(200).optional(), acceptExtra: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const order = await galleryOrderByToken(data.token, data.deviceKey);
    if (!order) throw new Error("קישור לא תקין");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const alreadyDone = !!order.proofs_selected_at;
    if (!alreadyDone) {
      const { data: selected } = await withSchemaCacheRetry(supabaseAdmin, () =>
        (supabaseAdmin as any)
          .from("outdoor_order_images")
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
      // toggleOutdoorProofByToken above), so this is a no-op there; in
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
          .from("outdoor_package_orders")
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
        .from("outdoor_package_orders")
        .update({ proofs_selected_at: new Date().toISOString() })
        .eq("id", order.id);
      if (stampErr) throw new Error(stampErr.message);

      // client_step: advance to 3 ("בחירת כיתובים, תמונות לקולאז' וכריכה")
      // — step 2 ("בחירת תמונות") is exactly what she just finished.
      // Best-effort, same reasoning as the split above.
      const { error: stepErr } = await (supabaseAdmin as any)
        .from("outdoor_package_orders")
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
            <p style="margin-top:20px"><a href="https://sweetbabyphoto.shop/admin/outdoor-packages" style="color:#2d3d2b;font-weight:600">לצפייה בניהול</a></p>
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
export const submitOutdoorUnlockReceiptByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(10),
        deviceKey: z.string().max(200).optional(),
        fileBase64: z.string().min(1).max(MAX_RECEIPT_BASE64_LEN),
        fileName: z.string().min(1).max(200),
        contentType: z.string().min(1).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const order = await galleryOrderByToken(data.token, data.deviceKey);
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
      .from("outdoor_package_orders")
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

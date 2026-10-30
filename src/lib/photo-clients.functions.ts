import { createServerFn } from "@tanstack/react-start";
import { toSiteMediaUrl } from "@/lib/media-url";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { newContractToken } from "@/lib/contract-token";

export const WORKFLOW_STAGES = ["booked", "date_confirmed", "proofs_ready", "edited_uploaded", "album_published"] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const STAGE_LABELS: Record<WorkflowStage, string> = {
  booked: "שריון ומקדמה",
  date_confirmed: "יום צילומים נקבע",
  proofs_ready: "המתנה לבחירת לקוחה",
  edited_uploaded: "תמונות מעובדות (טיוטה)",
  album_published: "אלבום פורסם",
};

// Package presets for the client card — hours/photo-count/price/upgrades
// per tier, used to prefill a new client's package details (still freely
// editable per-client afterward, since real bookings deviate from the
// price list all the time). "custom" has no defaults — the admin fills
// photosToEdit/albumUpgrades in by hand for a one-off arrangement.
export type PhotoPackageKey = "magic" | "popular" | "dream" | "custom";
export const PHOTO_PACKAGES: Record<PhotoPackageKey, { label: string; hours: number | null; photosToEdit: number | null; price: number | null; albumUpgrades: string }> = {
  magic: {
    label: "MAGIC · קסם",
    hours: 3,
    photosToEdit: 15,
    price: 1250,
    albumUpgrades: "כל התמונות בעיבוד בסיסי, 15 תמונות בעיבוד אומנותי, קולאז' מעוצב",
  },
  popular: {
    label: "POPULAR · פופולארית",
    hours: 4,
    photosToEdit: 25,
    price: 1750,
    albumUpgrades: "שיחת סטיילינג, כל התמונות בעיבוד בסיסי, 25 תמונות בעיבוד אומנותי, קולאז' מעוצב, אלבום דיגיטלי + כריכת בוק 21/56",
  },
  dream: {
    label: "DREAM · חלום",
    hours: 5,
    photosToEdit: 30,
    price: 2350,
    albumUpgrades: "חוץ + סטודיו, כל התמונות בעיבוד בסיסי, 30 תמונות בעיבוד אומנותי, קולאז' מעוצב, אלבום דיגיטלי + כריכת בוק 21/56",
  },
  custom: { label: "מותאם אישית", hours: null, photosToEdit: null, price: null, albumUpgrades: "" },
};

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

/**
 * Fetches (or lazily creates) the workflow row for a photography booking.
 * A workflow always belongs to a client (user_id) directly — for a
 * booking-created workflow that's just the booking's own user_id, copied
 * over once at creation so ownership checks never need to join back
 * through bookings.
 */
async function ensureWorkflowForBooking(supabaseAdmin: any, bookingId: string): Promise<{ id: string; stage: WorkflowStage }> {
  const { data: existing } = await supabaseAdmin.from("photo_client_workflows").select("id, stage").eq("booking_id", bookingId).maybeSingle();
  if (existing) return existing;
  const { data: booking, error: bErr } = await supabaseAdmin.from("bookings").select("user_id").eq("id", bookingId).single();
  if (bErr || !booking) throw new Error(bErr?.message ?? "הזמנה לא נמצאה");
  const { data: created, error } = await supabaseAdmin
    .from("photo_client_workflows")
    .insert({ booking_id: bookingId, user_id: booking.user_id, stage: "booked" })
    .select("id, stage")
    .single();
  if (error || !created) throw new Error(error?.message ?? "יצירת תהליך עבודה נכשלה");
  return created;
}

// ---------- Admin ----------

/**
 * Every photo-delivery workflow, admin-facing — both the ones auto-created
 * from a photography booking (package='photography', lazily created here
 * the first time each is seen) and the ones an admin started manually for
 * a client with no such booking (see startManualPhotoWorkflow).
 */
export const listPhotoClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: bookings, error: bErr } = await supabaseAdmin
      .from("bookings")
      .select("id, contact_name, contact_phone, session_date, start_time, deposit_status, price")
      .eq("package", "photography");
    if (bErr) throw new Error(bErr.message);
    for (const b of bookings ?? []) {
      await ensureWorkflowForBooking(supabaseAdmin, b.id);
    }

    const { data: workflows, error: wErr } = await supabaseAdmin
      .from("photo_client_workflows")
      .select(
        "id, user_id, booking_id, stage, created_at, session_date, session_time, location, package_type, photos_to_edit, total_price, amount_paid, balance, has_package, wants_editing",
      )
      .order("created_at", { ascending: false });
    if (wErr) throw new Error(wErr.message);

    const bookingById = new Map((bookings ?? []).map((b: any) => [b.id, b]));
    const userIds = Array.from(new Set((workflows ?? []).map((w: any) => w.user_id)));
    const { data: profiles } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, phone").in("id", userIds)
      : { data: [] as any[] };
    const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    // Photo counts for the "gallery card" list — one grouped count per
    // workflow rather than a per-row query for every client.
    const workflowIds = (workflows ?? []).map((w: any) => w.id);
    const { data: allImages } = workflowIds.length
      ? await supabaseAdmin.from("photo_client_images").select("workflow_id").in("workflow_id", workflowIds)
      : { data: [] as any[] };
    const photoCountByWorkflow = new Map<string, number>();
    for (const img of allImages ?? []) {
      photoCountByWorkflow.set(img.workflow_id, (photoCountByWorkflow.get(img.workflow_id) ?? 0) + 1);
    }

    // Emails for the "gallery card" list (auth.users, same pagination as
    // listClientEmails) — shown under the client's name like the reference.
    const emailByUserId = new Map<string, string>();
    for (let page = 1; page <= 10; page++) {
      const { data: usersPage, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      for (const u of usersPage.users) emailByUserId.set(u.id, u.email ?? "");
      if (usersPage.users.length < 200) break;
    }

    return (workflows ?? []).map((w: any) => {
      const booking = w.booking_id ? bookingById.get(w.booking_id) : null;
      const profile = profileById.get(w.user_id);
      return {
        id: w.id as string, // photo_client_workflows.id — what admin.photo-clients.tsx links on
        booking_id: w.booking_id as string | null,
        contact_name: booking?.contact_name || profile?.full_name || "—",
        contact_phone: booking?.contact_phone || profile?.phone || "—",
        contact_email: emailByUserId.get(w.user_id) ?? "",
        // The workflow's own session_date is the source of truth (set at
        // creation, freely editable afterward) — the booking's is only a
        // fallback for old rows from before this column existed.
        session_date: w.session_date ?? booking?.session_date ?? null,
        session_time: (w.session_time ?? booking?.start_time ?? null) as string | null,
        location: w.location as string | null,
        package_type: w.package_type as PhotoPackageKey | null,
        photos_to_edit: w.photos_to_edit as number | null,
        photo_count: photoCountByWorkflow.get(w.id) ?? 0,
        total_price: w.total_price as number | null,
        amount_paid: w.amount_paid as number,
        balance: w.balance as number | null,
        stage: w.stage as WorkflowStage,
        has_package: w.has_package as boolean,
        wants_editing: w.wants_editing as boolean | null,
      };
    });
  });

const userIdSchema = z.object({ userId: z.string().uuid() });

/**
 * Admin starts a photo-delivery workflow for a client directly — for a
 * shoot that isn't (or isn't yet) a package='photography' booking, e.g. a
 * walk-in session or one predating this feature. Picked from "לקוחות".
 */
export const startManualPhotoWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin
      .from("photo_client_workflows")
      .insert({ user_id: data.userId, booking_id: null, stage: "booked" })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "יצירת תהליך עבודה נכשלה");
    return { workflowId: created.id as string };
  });

const createClientSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  sessionDate: z.string().max(10).optional(), // yyyy-mm-dd
  sessionTime: z.string().max(8).optional(), // HH:MM
  location: z.string().max(200).optional(),
  packageType: z.enum(["magic", "popular", "dream", "custom"]).optional(),
  photosToEdit: z.number().int().min(0).max(1000).optional(), // overrides the package default
  albumUpgrades: z.string().max(2000).optional(), // overrides the package default
  sendEmail: z.boolean().optional(),
  // "חבילה" (full package: shoot+editing+album, the existing pipeline) vs
  // studio-only. Defaults true so every pre-existing call site (manual
  // workflow start, etc.) keeps behaving exactly as before.
  hasPackage: z.boolean().optional(),
  // Only meaningful when hasPackage is false — did a studio-only client
  // also buy editing? false means "just hand her the photos, no pipeline".
  wantsEditing: z.boolean().optional(),
});

// A short, memorable temp password padded to satisfy Supabase Auth's
// password policy (min length + upper/lower/digit) — same ".Sb1" suffix
// trick admin.clients.tsx already uses for short admin-chosen passwords.
// Whatever gets told to the client (verbally, WhatsApp, or the email
// below) must be this exact string, not just "1234" — that alone won't
// pass Supabase's own validation.
const TEMP_PASSWORD = "1234.Sb1";

/**
 * Creates (or reuses) a photo client's card: looks her up by email first —
 * if an account with that email already exists it's reused as-is (her real
 * password is never touched) along with its existing workflow, if any
 * (never creates a duplicate). Otherwise a real account is minted for her
 * with a temp password, and — only if requested — a notification email is
 * sent. Package/shoot details (see PHOTO_PACKAGES) are saved on the new
 * workflow either way; an existing workflow's details are left alone (use
 * updatePhotoClientDetails to edit those later).
 */
export const createPhotoClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createClientSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();
    const name = data.name?.trim();
    const phone = data.phone?.trim();

    // auth.users has no direct "find by email" in the admin API — page
    // through listUsers same as listClientEmails does.
    let userId: string | null = null;
    for (let page = 1; page <= 20; page++) {
      const { data: usersPage, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      const match = usersPage.users.find((u: any) => (u.email ?? "").toLowerCase() === email);
      if (match) {
        userId = match.id;
        break;
      }
      if (usersPage.users.length < 200) break;
    }

    let isNewAccount = false;
    if (!userId) {
      const { data: createdUser, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: TEMP_PASSWORD,
        email_confirm: true,
        // Read by the handle_new_user trigger to prefill profiles.full_name/phone.
        user_metadata: name || phone ? { full_name: name, phone } : undefined,
      });
      if (error || !createdUser?.user) throw new Error(error?.message ?? "יצירת חשבון ללקוחה נכשלה");
      userId = createdUser.user.id;
      isNewAccount = true;
    }

    if (isNewAccount && data.sendEmail) {
      try {
        const { sendGmail } = await import("@/integrations/google/gmail.server");
        await sendGmail({
          to: email,
          subject: "נפתח לך חשבון · Sweetbaby",
          html: `<div dir="rtl" style="font-family:sans-serif">
            <p>שלום${name ? " " + name : ""},</p>
            <p>פתחנו לך חשבון באתר הסטודיו של מיכל סיבוני, כדי שתוכלי לראות שם את התמונות שלך.</p>
            <p>אימייל: <b dir="ltr">${email}</b><br/>סיסמה זמנית: <b dir="ltr">${TEMP_PASSWORD}</b></p>
            <p>מומלץ להחליף אותה לאחר הכניסה הראשונה.</p>
          </div>`,
        });
      } catch (e) {
        // Best-effort — the account/workflow are already created either
        // way, so a failed email shouldn't fail the whole action. The
        // admin can still tell her the code directly.
        console.error("[SWEETBABY] photo-client account email failed", e);
      }
    }

    const { data: existingWf } = await supabaseAdmin
      .from("photo_client_workflows")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingWf) return { workflowId: existingWf.id as string, isNewAccount, tempPassword: isNewAccount ? TEMP_PASSWORD : null };

    const preset = data.packageType ? PHOTO_PACKAGES[data.packageType] : null;
    const hasPackage = data.hasPackage ?? true;
    const wantsEditing = hasPackage ? null : (data.wantsEditing ?? null);
    // A studio-only client with no editing has nothing to progress
    // through — no proofs to pick from, no album to publish. She starts
    // straight at "album_published" so the detail page shows just the
    // plain upload card, and /my-photos shows whatever's uploaded
    // immediately (that page already treats album_published as "final,
    // visible to the client", see getMyPhotoGalleries).
    const simpleDeliveryOnly = !hasPackage && wantsEditing === false;
    const { data: created, error: wfErr } = await supabaseAdmin
      .from("photo_client_workflows")
      .insert({
        user_id: userId,
        booking_id: null,
        stage: simpleDeliveryOnly ? "album_published" : "booked",
        session_date: data.sessionDate || null,
        session_time: data.sessionTime || null,
        location: data.location?.trim() || null,
        package_type: hasPackage ? (data.packageType ?? null) : null,
        photos_to_edit: hasPackage ? (data.photosToEdit ?? preset?.photosToEdit ?? null) : null,
        album_upgrades: hasPackage ? data.albumUpgrades?.trim() || preset?.albumUpgrades || null : null,
        has_package: hasPackage,
        wants_editing: wantsEditing,
      })
      .select("id")
      .single();
    if (wfErr || !created) throw new Error(wfErr?.message ?? "יצירת תהליך עבודה נכשלה");
    return { workflowId: created.id as string, isNewAccount, tempPassword: isNewAccount ? TEMP_PASSWORD : null };
  });

const updateDetailsSchema = z.object({
  workflowId: z.string().uuid(),
  sessionDate: z.string().max(10).optional().nullable(),
  sessionTime: z.string().max(8).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  packageType: z.enum(["magic", "popular", "dream", "custom"]).optional().nullable(),
  photosToEdit: z.number().int().min(0).max(1000).optional().nullable(),
  albumUpgrades: z.string().max(2000).optional().nullable(),
  // Always entered by hand — never auto-filled from PHOTO_PACKAGES.price,
  // since the real agreed price commonly differs from the price list.
  totalPrice: z.number().nonnegative().max(1000000).optional().nullable(),
  amountPaid: z.number().nonnegative().max(1000000).optional(),
  hasPackage: z.boolean().optional(),
  wantsEditing: z.boolean().optional().nullable(),
  // Max proofs the client may mark as favorites before submitting her
  // final selection — null/omitted means no limit (today's behavior).
  maxProofSelections: z.number().int().min(1).max(1000).optional().nullable(),
  // Opt-in "smart" two-phase flow (free selection first, then narrow down
  // to the limit) — per explicit request, OFF by default; most clients
  // still get the plain single-pass grid unless the admin turns this on.
  guidedSelectionEnabled: z.boolean().optional(),
});

/** Edits a client card's package/shoot/payment details after creation — the detail page's "עריכת פרטי חבילה" panel. */
export const updatePhotoClientDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateDetailsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { workflowId, ...fields } = data;
    const { error } = await supabaseAdmin
      .from("photo_client_workflows")
      .update({
        session_date: fields.sessionDate || null,
        session_time: fields.sessionTime || null,
        location: fields.location?.trim() || null,
        package_type: fields.packageType || null,
        photos_to_edit: fields.photosToEdit ?? null,
        album_upgrades: fields.albumUpgrades?.trim() || null,
        total_price: fields.totalPrice ?? null,
        ...(fields.amountPaid != null ? { amount_paid: fields.amountPaid } : {}),
        ...(fields.hasPackage != null ? { has_package: fields.hasPackage } : {}),
        ...(fields.wantsEditing !== undefined ? { wants_editing: fields.wantsEditing } : {}),
        ...(fields.maxProofSelections !== undefined ? { max_proof_selections: fields.maxProofSelections } : {}),
        ...(fields.guidedSelectionEnabled != null ? { guided_selection_enabled: fields.guidedSelectionEnabled } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", workflowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const workflowIdSchema = z.object({ workflowId: z.string().uuid() });

/** Full detail for one photo-delivery workflow — client/booking info + all images. */
export const getPhotoClientDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => workflowIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // select("*") rather than an explicit column list — client_step/
    // production_step (and any other very-new column) may not have landed
    // on the live database yet (the usual Lovable/Drizzle migration lag
    // documented elsewhere in this codebase); naming a column that doesn't
    // exist yet makes PostgREST error out the WHOLE select, which breaks
    // this entire page. "*" just omits a missing column from the row
    // instead of erroring, and every field below already casts through
    // `workflow as any` with `?? defaults` for exactly this reason.
    const { data: workflow, error: wErr } = await (supabaseAdmin as any)
      .from("photo_client_workflows")
      .select("*")
      .eq("id", data.workflowId)
      .single();
    if (wErr || !workflow) throw new Error(wErr?.message ?? "לקוחה לא נמצאה");

    let booking: any = null;
    if (workflow.booking_id) {
      const { data: b } = await supabaseAdmin
        .from("bookings")
        .select("id, contact_name, contact_phone, session_date, start_time, end_time, status, deposit_status, price")
        .eq("id", workflow.booking_id)
        .maybeSingle();
      booking = b;
    }
    if (!booking) {
      const { data: profile } = await supabaseAdmin.from("profiles").select("full_name, phone").eq("id", workflow.user_id).maybeSingle();
      booking = { id: workflow.id, contact_name: profile?.full_name || "—", contact_phone: profile?.phone || "—", session_date: null };
    }

    const { data: images, error: imgErr } = await supabaseAdmin
      .from("photo_client_images")
      .select("*")
      .eq("workflow_id", workflow.id)
      .order("sort_order", { ascending: true });
    if (imgErr) throw new Error(imgErr.message);

    return {
      booking,
      workflow: {
        id: workflow.id as string,
        stage: workflow.stage as WorkflowStage,
        session_date: (workflow.session_date ?? booking.session_date) as string | null,
        session_time: (workflow.session_time ?? booking.start_time ?? null) as string | null,
        location: workflow.location as string | null,
        package_type: workflow.package_type as PhotoPackageKey | null,
        photos_to_edit: workflow.photos_to_edit as number | null,
        album_upgrades: workflow.album_upgrades as string | null,
        total_price: workflow.total_price as number | null,
        amount_paid: workflow.amount_paid as number,
        balance: workflow.balance as number | null,
        has_package: workflow.has_package as boolean,
        wants_editing: workflow.wants_editing as boolean | null,
        max_proof_selections: workflow.max_proof_selections as number | null,
        proof_selection_submitted_at: workflow.proof_selection_submitted_at as string | null,
        drive_folder_url: (workflow as any).drive_folder_url as string | null,
        drive_synced_at: (workflow as any).drive_synced_at as string | null,
        guided_selection_enabled: (workflow as any).guided_selection_enabled as boolean,
        all_photos_unlocked: (workflow as any).all_photos_unlocked as boolean,
        unlock_receipt_submitted_at: (workflow as any).unlock_receipt_submitted_at as string | null,
        client_step: ((workflow as any).client_step ?? 1) as number,
        production_step: ((workflow as any).production_step ?? 1) as number,
      },
      images: images ?? [],
    };
  });

/**
 * Sends the studio's real photo-session contract to one client — the fixed
 * terms (see photoContract.ts) filled in with THIS client's saved date/
 * time/package details (PackageDetails on admin.photo-clients.$bookingId.tsx
 * must be saved first, or the send is refused with a clear reason instead
 * of going out with blank/guessed fields). Triggered by a "שליחת חוזה"
 * button, not automatically on deposit confirmation — package specifics
 * vary per client and aren't known until the admin has actually entered
 * them for this workflow.
 */
export const sendPhotoClientContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => workflowIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: workflow, error: wErr } = await supabaseAdmin
      .from("photo_client_workflows")
      .select("*")
      .eq("id", data.workflowId)
      .single();
    if (wErr || !workflow) throw new Error(wErr?.message ?? "לקוחה לא נמצאה");

    const sessionDate = (workflow.session_date as string | null) ?? null;
    if (!sessionDate) throw new Error("יש לשמור קודם מועד צילומים בפרטי החבילה לפני שליחת החוזה.");

    let contactName = "";
    if (workflow.booking_id) {
      const { data: booking } = await supabaseAdmin
        .from("bookings")
        .select("contact_name")
        .eq("id", workflow.booking_id)
        .maybeSingle();
      contactName = booking?.contact_name || "";
    }
    if (!contactName) {
      const { data: profile } = await supabaseAdmin.from("profiles").select("full_name").eq("id", workflow.user_id).maybeSingle();
      contactName = profile?.full_name || "";
    }

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(workflow.user_id);
    const contactEmail = userErr ? null : userRes?.user?.email ?? null;
    if (!contactEmail) throw new Error("לא נמצאה כתובת מייל ללקוחה הזו — אי אפשר לשלוח חוזה.");

    // Token for the section-by-section signing page (/contract/photo/$token),
    // created once and reused on a resend so an older email's link still works.
    let contractToken = (workflow as any).contract_token as string | null;
    if (!contractToken) {
      contractToken = newContractToken();
      await (supabaseAdmin as any).from("photo_client_workflows").update({ contract_token: contractToken }).eq("id", workflow.id);
    }

    const { buildPhotoContractHtml } = await import("@/lib/photoContract");
    const html = buildPhotoContractHtml({
      confirmLink: `https://sweetbabyphoto.shop/contract/photo/${contractToken}`,
      contactName,
      sessionDate,
      sessionTime: (workflow.session_time as string | null)?.slice(0, 5) ?? null,
      photosToEdit: workflow.photos_to_edit as number | null,
      totalPrice: workflow.total_price as number | null,
      albumUpgrades: workflow.album_upgrades as string | null,
    });

    const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
    await sendStudioAndCustomer({
      customerEmail: contactEmail,
      subject: `חוזה והסכם צילומים · Sweetbaby${contactName ? ` — ${contactName}` : ""}`,
      html,
    });
    await (supabaseAdmin as any)
      .from("photo_client_workflows")
      .update({ contract_sent_at: new Date().toISOString() })
      .eq("id", workflow.id);

    return { ok: true, sentTo: contactEmail };
  });

const paymentReminderSchema = z.object({ workflowIds: z.array(z.string().uuid()).min(1).max(200) });

/**
 * Bulk "מייל תשלום ללקוחות" — sends each given client a payment-status
 * email (amount paid / open balance). Skips (doesn't error out the whole
 * batch on) a client with no email, no open balance, or a failed send —
 * returns per-client results so the admin sees exactly who did/didn't
 * get one.
 */
export const sendPaymentReminderEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => paymentReminderSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendGmail } = await import("@/integrations/google/gmail.server");

    const { data: workflows, error } = await supabaseAdmin
      .from("photo_client_workflows")
      .select("id, user_id, total_price, amount_paid, balance")
      .in("id", data.workflowIds);
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((workflows ?? []).map((w: any) => w.user_id)));
    const { data: profiles } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as any[] };
    const nameByUserId = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));

    const emailByUserId = new Map<string, string>();
    for (let page = 1; page <= 10; page++) {
      const { data: usersPage, error: uErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (uErr) throw new Error(uErr.message);
      for (const u of usersPage.users) emailByUserId.set(u.id, u.email ?? "");
      if (usersPage.users.length < 200) break;
    }

    const results = await Promise.all(
      (workflows ?? []).map(async (w: any) => {
        const email = emailByUserId.get(w.user_id);
        if (!email) return { workflowId: w.id, sent: false, reason: "אין אימייל ללקוחה" };
        if (w.total_price == null) return { workflowId: w.id, sent: false, reason: "לא הוגדר סכום כולל" };
        if (Number(w.balance ?? 0) <= 0) return { workflowId: w.id, sent: false, reason: "אין יתרה פתוחה" };

        const name = nameByUserId.get(w.user_id) || "";
        try {
          const ok = await sendGmail({
            to: email,
            subject: "תזכורת תשלום · Sweetbaby",
            html: `<div dir="rtl" style="font-family:sans-serif">
              <p>שלום${name ? " " + name : ""},</p>
              <p>סה״כ לתשלום: <b>₪${Number(w.total_price).toFixed(0)}</b><br/>
              שולם עד כה: <b>₪${Number(w.amount_paid).toFixed(0)}</b><br/>
              יתרה לתשלום: <b>₪${Number(w.balance).toFixed(0)}</b></p>
              <p>לתיאום התשלום אפשר להשיב למייל הזה או ליצור קשר עם הסטודיו.</p>
            </div>`,
          });
          return { workflowId: w.id, sent: ok, reason: ok ? undefined : "שליחת המייל נכשלה" };
        } catch (e: any) {
          return { workflowId: w.id, sent: false, reason: e?.message ?? "שליחת המייל נכשלה" };
        }
      }),
    );
    return { results };
  });

const advanceSchema = z.object({ workflowId: z.string().uuid(), stage: z.enum(WORKFLOW_STAGES) });

/**
 * Admin manually moves a client's workflow to a given stage (confirm date,
 * publish album, etc.). Moving to `proofs_ready` emails the client (and the
 * studio's own inbox — sendStudioAndCustomer always CCs it) that her proof
 * photos are up for selection, with the one-week pick deadline called out —
 * matching the actual one-week window runDueProofSelectionReminders' own
 * nudge is timed around. Moving to `album_published` emails that the final
 * edited photos are ready. Both per explicit request, both best-effort (a
 * failed email never blocks the stage update itself, same as every other
 * notification send in this file).
 */
export const advancePhotoClientStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => advanceSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.from("photo_client_workflows").select("user_id, stage").eq("id", data.workflowId).maybeSingle();
    const { error } = await supabaseAdmin
      .from("photo_client_workflows")
      .update({ stage: data.stage, updated_at: new Date().toISOString() })
      .eq("id", data.workflowId);
    if (error) throw new Error(error.message);

    if (data.stage === "proofs_ready" && before && before.stage !== "proofs_ready") {
      try {
        const {
          data: { user },
        } = await supabaseAdmin.auth.admin.getUserById(before.user_id);
        const { data: profile } = await supabaseAdmin.from("profiles").select("full_name").eq("id", before.user_id).maybeSingle();
        const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
        const { emailHeartImgTag } = await import("@/lib/page-images");
        const heart = await emailHeartImgTag();
        await sendStudioAndCustomer({
          customerEmail: user?.email,
          subject: "התמונות שלך מחכות לבחירה 📸 · Sweetbaby",
          html: `<div dir="rtl" style="font-family:sans-serif">
            <p>שלום${profile?.full_name ? " " + profile.full_name : ""},</p>
            <p>תמונות הגלם מהצילומים שלך נשלחו לבחירה! אפשר לבחור את המועדפות עלייך כאן:</p>
            <p><a href="https://sweetbabyphoto.shop/my-photos">https://sweetbabyphoto.shop/my-photos</a></p>
            <p><b>יש לבחור תוך שבוע</b> כדי שנוכל להתקדם לעיבוד בזמן.</p>
            <p>מחכים לבחירה שלך ${heart}</p>
          </div>`,
        });
      } catch (e) {
        console.error("[SWEETBABY] proofs-ready notification email failed", e);
      }
    }

    if (data.stage === "album_published" && before && before.stage !== "album_published") {
      try {
        const {
          data: { user },
        } = await supabaseAdmin.auth.admin.getUserById(before.user_id);
        const { data: profile } = await supabaseAdmin.from("profiles").select("full_name").eq("id", before.user_id).maybeSingle();
        const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
        const { emailHeartImgTag } = await import("@/lib/page-images");
        const heart = await emailHeartImgTag();
        await sendStudioAndCustomer({
          customerEmail: user?.email,
          subject: "התמונות המעובדות שלך מוכנות! 💗 · Sweetbaby",
          html: `<div dir="rtl" style="font-family:sans-serif">
            <p>שלום${profile?.full_name ? " " + profile.full_name : ""},</p>
            <p>התמונות המעובדות שלך מוכנות ומחכות לך! אפשר לצפות ולהוריד אותן כאן:</p>
            <p><a href="https://sweetbabyphoto.shop/my-photos">https://sweetbabyphoto.shop/my-photos</a></p>
            <p>מקווה שתאהבי ${heart}</p>
          </div>`,
        });
      } catch (e) {
        console.error("[SWEETBABY] album-published notification email failed", e);
      }
    }
    return { ok: true };
  });

/**
 * 7 days after the shoot date, if the client still hasn't finished picking
 * her proof photos (workflow still sitting at proofs_ready), send her one
 * reminder email — per explicit request. Dedup via proof_reminder_sent_at
 * (same idiom as bookings.reminder_sent_at) so it only ever goes out once.
 * Called from api.send-booking-reminders.ts alongside the other periodic
 * reminder jobs.
 */
export async function runDueProofSelectionReminders(): Promise<{ checked: number; sent: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Bounded window: shoots from 7 to 60 days ago — old enough to be due,
  // not so old we're re-scanning the whole table forever. A workflow with
  // no session_date can't be dated, so it's never a candidate here.
  const today = new Date();
  const dueBy = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const windowStart = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // proof_reminder_sent_at can lag a schema deploy (same class of issue
  // documented in api.yemot.ivr.ts's selectVoiceSession/upsertVoiceSession)
  // — confirmed live: this column was missing on the production database,
  // which made the WHOLE select fail on every single cron run (96 times/day
  // at a 15-min interval) and silently stopped every proof-selection
  // reminder from ever going out, with nothing surfacing the failure. Retry
  // without the dedup filter if the first attempt errors, so reminders keep
  // flowing even during a deploy lag — worst case here is a duplicate
  // reminder email for the same client until the column catches up, which
  // is far better than the alternative (none ever sent again, forever).
  const full = await supabaseAdmin
    .from("photo_client_workflows")
    .select("id, user_id, session_date")
    .eq("stage", "proofs_ready")
    .is("proof_reminder_sent_at", null)
    .not("session_date", "is", null)
    .lte("session_date", dueBy)
    .gte("session_date", windowStart);

  let candidates = full.data;
  if (full.error) {
    console.error("[SWEETBABY] proof-reminder scan failed (proof_reminder_sent_at column may be missing), retrying without the dedup filter", full.error);
    const fallback = await supabaseAdmin
      .from("photo_client_workflows")
      .select("id, user_id, session_date")
      .eq("stage", "proofs_ready")
      .not("session_date", "is", null)
      .lte("session_date", dueBy)
      .gte("session_date", windowStart);
    if (fallback.error) {
      console.error("[SWEETBABY] proof-reminder scan fallback ALSO failed", fallback.error);
      return { checked: 0, sent: 0 };
    }
    candidates = fallback.data;
  }

  let sent = 0;
  for (const w of candidates ?? []) {
    try {
      const {
        data: { user },
      } = await supabaseAdmin.auth.admin.getUserById(w.user_id);
      const { data: profile } = await supabaseAdmin.from("profiles").select("full_name").eq("id", w.user_id).maybeSingle();
      const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
      await sendStudioAndCustomer({
        customerEmail: user?.email,
        subject: "תזכורת: בחירת התמונות שלך מחכה 📸 · Sweetbaby",
        html: `<div dir="rtl" style="font-family:sans-serif">
          <p>שלום${profile?.full_name ? " " + profile.full_name : ""},</p>
          <p>רק תזכורת חמה — התמונות מהצילומים שלך כבר מחכות לבחירה, ועוד לא סימנת את המועדפות עלייך.</p>
          <p>אפשר לבחור כאן: <a href="https://sweetbabyphoto.shop/my-photos">https://sweetbabyphoto.shop/my-photos</a></p>
          <p>כדי שנוכל להתקדם לעיבוד ולשלוח לך את האלבום הסופי בקרוב, נשמח שתזדרזי קצת 💛</p>
        </div>`,
      });
      // Counted as sent the moment the email itself succeeds — the dedup
      // marker below is a separate, best-effort write. If IT fails (e.g.
      // the same missing-column deploy lag), that must never look like the
      // email send itself failed and must never undo the count above; it
      // only means this client risks one more duplicate reminder on the
      // next run, not that this run's reminder didn't actually go out.
      sent += 1;
      // proof_reminder_sent_at is a brand-new column — cast until types.ts
      // is regenerated against it (same idiom already used for
      // retouch_presets/retouch_allowed_clients in admin.retouch-presets.tsx).
      // supabase-js returns {error} instead of throwing on a query failure
      // (confirmed elsewhere in this codebase, e.g. selectVoiceSession in
      // api.yemot.ivr.ts), so this must check markError explicitly — a
      // try/catch around the call alone would never see a missing-column
      // failure here.
      const { error: markError } = await (supabaseAdmin as any)
        .from("photo_client_workflows")
        .update({ proof_reminder_sent_at: new Date().toISOString() })
        .eq("id", w.id);
      if (markError) {
        console.error("[SWEETBABY] proof-reminder dedup marker write failed for workflow (email was still sent)", w.id, markError);
      }
    } catch (e) {
      console.error("[SWEETBABY] proof-selection reminder failed for workflow", w.id, e);
    }
  }
  return { checked: (candidates ?? []).length, sent };
}

const stepTrackerSchema = z.object({
  workflowId: z.string().uuid(),
  clientStep: z.number().int().min(1).max(4).optional(),
  productionStep: z.number().int().min(1).max(6).optional(),
});

/**
 * Admin-only — moves either (or both) of the two visual progress
 * breadcrumbs (StepTracker.tsx) on the client detail page. Purely a manual
 * indicator, same as its sibling in photographer-portal — never touches
 * `stage`, which keeps driving the real proof-selection/album logic.
 */
export const updatePhotoClientSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => stepTrackerSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const update: Record<string, number> = {};
    if (data.clientStep != null) update.client_step = data.clientStep;
    if (data.productionStep != null) update.production_step = data.productionStep;
    if (Object.keys(update).length === 0) return { ok: true };
    const { error } = await (supabaseAdmin as any).from("photo_client_workflows").update(update).eq("id", data.workflowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const addImageSchema = z.object({
  workflowId: z.string().uuid(),
  kind: z.enum(["proof", "edited"]),
  storagePath: z.string().min(1),
  imageUrl: z.string().url(),
  // The untouched, full-resolution upload — kept alongside the (possibly
  // compressed/watermarked) display copy above so the client's ZIP
  // download always has something genuinely full-quality to pull from.
  // Omitted falls back to the display copy itself (e.g. the old proof
  // path, which already uploads at full res with no separate original).
  originalStoragePath: z.string().min(1).optional(),
  originalImageUrl: z.string().url().optional(),
  watermarked: z.boolean().optional(),
});

/** Records one uploaded image (the actual file upload happens client-side to Storage first, same pattern as admin.items.tsx). */
export const addPhotoClientImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addImageSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("photo_client_images").insert({
      workflow_id: data.workflowId,
      kind: data.kind,
      storage_path: data.storagePath,
      image_url: data.imageUrl,
      original_storage_path: data.originalStoragePath ?? data.storagePath,
      original_image_url: data.originalImageUrl ?? data.imageUrl,
      watermarked: data.watermarked ?? false,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const adminToggleSchema = z.object({ imageId: z.string().uuid(), selected: z.boolean() });

/**
 * Admin-side "V" marking on a proof photo — e.g. the client picked her
 * favorites in person/by phone rather than through /my-photos. Unlike the
 * customer-facing toggleProofSelection below, this isn't restricted to the
 * proofs_ready stage (an admin may want to pre-mark before publishing the
 * proofs) and doesn't check ownership — admin role is enough.
 */
export const adminToggleProofSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adminToggleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("photo_client_images").update({ selected: data.selected }).eq("id", data.imageId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const imageIdSchema = z.object({ imageId: z.string().uuid() });

export const deletePhotoClientImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => imageIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: img } = await (supabaseAdmin as any)
      .from("photo_client_images")
      .select("storage_path, original_storage_path")
      .eq("id", data.imageId)
      .maybeSingle();
    const paths = Array.from(new Set([img?.storage_path, img?.original_storage_path].filter(Boolean))) as string[];
    if (paths.length) await supabaseAdmin.storage.from("items").remove(paths);
    const { error } = await supabaseAdmin.from("photo_client_images").delete().eq("id", data.imageId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const bulkDeleteSchema = z.object({ imageIds: z.array(z.string().uuid()).min(1).max(500) });

/** Bulk version of deletePhotoClientImage — used by PhotoTriagePanel.tsx's "מחיקת המסומנות" (delete the ones marked trash) button, so confirming a triage pass is one call instead of N. */
export const bulkDeletePhotoClientImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkDeleteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: imgs } = await (supabaseAdmin as any)
      .from("photo_client_images")
      .select("storage_path, original_storage_path")
      .in("id", data.imageIds);
    const paths = Array.from(new Set((imgs ?? []).flatMap((i: any) => [i.storage_path, i.original_storage_path]).filter(Boolean))) as string[];
    if (paths.length) await supabaseAdmin.storage.from("items").remove(paths);
    const { error } = await supabaseAdmin.from("photo_client_images").delete().in("id", data.imageIds);
    if (error) throw new Error(error.message);
    return { ok: true, deleted: data.imageIds.length };
  });

const DRIVE_ALBUMS_PARENT_FOLDER = "Sweetbaby - אלבומים ללקוחות";

/**
 * "גיבוי ושיתוף בדרייב" — per explicit request, serves BOTH purposes at
 * once rather than two separate buttons: uploads every "edited" (final)
 * image's full-quality ORIGINAL (never the possibly-compressed display
 * copy) into a per-client subfolder of a shared Drive parent, which also
 * doubles as a real backup of the delivered album outside this app's own
 * storage. The subfolder is made link-shareable in the same call, so the
 * admin gets back a link she can choose to copy/send to the client (see
 * the "שליחת קישור ללקוחה" button in admin.photo-clients.$bookingId.tsx) —
 * sharing it is her call, not automatic. Safe to re-run any time an image
 * is added/changed: uploadImageToDrive replaces a same-named file in place
 * rather than duplicating it.
 */
export const syncAlbumToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => workflowIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { uploadImageToDrive, getShareableAlbumFolderLink } = await import("@/integrations/google/drive.server");

    const { data: workflow, error: wErr } = await supabaseAdmin
      .from("photo_client_workflows")
      .select("id, user_id, booking_id")
      .eq("id", data.workflowId)
      .single();
    if (wErr || !workflow) throw new Error(wErr?.message ?? "לקוחה לא נמצאה");

    let contactName = "";
    if (workflow.booking_id) {
      const { data: booking } = await supabaseAdmin.from("bookings").select("contact_name").eq("id", workflow.booking_id).maybeSingle();
      contactName = booking?.contact_name || "";
    }
    if (!contactName) {
      const { data: profile } = await supabaseAdmin.from("profiles").select("full_name").eq("id", workflow.user_id).maybeSingle();
      contactName = profile?.full_name || "";
    }
    const subFolderName = `${contactName || "לקוחה"} · ${data.workflowId.slice(0, 8)}`;

    const { data: images, error: imgErr } = await (supabaseAdmin as any)
      .from("photo_client_images")
      .select("original_image_url, image_url, sort_order")
      .eq("workflow_id", data.workflowId)
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
        await uploadImageToDrive(`${String(i + 1).padStart(3, "0")}.${ext}`, bytes, contentType, DRIVE_ALBUMS_PARENT_FOLDER, subFolderName);
        uploaded += 1;
      } catch (e) {
        console.error(`[SWEETBABY] Drive album sync: image ${i + 1} failed`, e);
      }
    }

    const link = await getShareableAlbumFolderLink(DRIVE_ALBUMS_PARENT_FOLDER, subFolderName);
    const now = new Date().toISOString();
    await (supabaseAdmin as any).from("photo_client_workflows").update({ drive_folder_url: link, drive_synced_at: now }).eq("id", data.workflowId);

    return { ok: true, uploaded, total: images.length, link };
  });

const shareLinkSchema = z.object({ workflowId: z.string().uuid() });

/** "שליחת קישור ללקוחה" — emails the already-synced Drive album link to the client (and studio, as every sendStudioAndCustomer call does). Refuses if syncAlbumToDrive hasn't run yet (no link saved) rather than sending a broken/empty email. */
export const sendDriveAlbumLinkToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => shareLinkSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: workflow, error: wErr } = await (supabaseAdmin as any)
      .from("photo_client_workflows")
      .select("id, user_id, booking_id, drive_folder_url")
      .eq("id", data.workflowId)
      .single();
    if (wErr || !workflow) throw new Error(wErr?.message ?? "לקוחה לא נמצאה");
    if (!workflow.drive_folder_url) throw new Error("יש לבצע קודם גיבוי לדרייב");

    let contactName = "";
    if (workflow.booking_id) {
      const { data: booking } = await supabaseAdmin.from("bookings").select("contact_name").eq("id", workflow.booking_id).maybeSingle();
      contactName = booking?.contact_name || "";
    }
    if (!contactName) {
      const { data: profile } = await supabaseAdmin.from("profiles").select("full_name").eq("id", workflow.user_id).maybeSingle();
      contactName = profile?.full_name || "";
    }

    const {
      data: { user },
    } = await supabaseAdmin.auth.admin.getUserById(workflow.user_id);
    if (!user?.email) throw new Error("לא נמצאה כתובת מייל ללקוחה הזו");

    const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
    const { emailHeartImgTag } = await import("@/lib/page-images");
    const heart = await emailHeartImgTag();
    await sendStudioAndCustomer({
      customerEmail: user.email,
      subject: "האלבום שלך בדרייב 📁 · Sweetbaby",
      html: `<div dir="rtl" style="font-family:sans-serif">
        <p>שלום${contactName ? " " + contactName : ""},</p>
        <p>האלבום המלא שלך זמין גם בגוגל דרייב, באיכות מלאה:</p>
        <p><a href="${workflow.drive_folder_url}">${workflow.drive_folder_url}</a></p>
        <p>מקווה שתאהבי ${heart}</p>
      </div>`,
    });

    return { ok: true, sentTo: user.email };
  });

// ---------- Customer ----------

/**
 * The signed-in customer's own photo-delivery workflows, each with the
 * images she's actually allowed to see at that stage: proofs (to pick
 * favorites) once proofs_ready, the final edited set once album_published
 * — never the admin's edited-but-unpublished drafts. Includes workflows
 * an admin started manually (no booking), not only ones tied to a
 * package='photography' booking.
 */
export const getMyPhotoGalleries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // select("*") — see getPhotoClientDetail's matching comment: naming a
    // very-new column (client_step) that hasn't landed on the live
    // database yet would error out this ENTIRE query, breaking /my-photos
    // for every customer. "*" degrades gracefully instead.
    const { data: workflows, error } = await (supabase as any)
      .from("photo_client_workflows")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const bookingIds = (workflows ?? []).map((w: any) => w.booking_id).filter(Boolean);
    const { data: bookings } = bookingIds.length
      ? await supabase.from("bookings").select("id, session_date, start_time, contact_name").in("id", bookingIds)
      : { data: [] as any[] };
    const bookingById = new Map((bookings ?? []).map((b: any) => [b.id, b]));

    const galleries = await Promise.all(
      (workflows ?? []).map(async (w: any) => {
        const stage = w.stage as WorkflowStage;
        let kind: "proof" | "edited" | null = null;
        if (stage === "proofs_ready") kind = "proof";
        else if (stage === "album_published") kind = "edited";

        let images: any[] = [];
        if (kind) {
          // original_image_url: what the ZIP download actually pulls for
          // both kinds — always full quality regardless of what the grid
          // displays. For "proof" this backs the paid "ללא סימן מים"
          // unlock ZIP; for "edited" it's the regular album ZIP.
          const { data: imgs } = await (supabase as any)
            .from("photo_client_images")
            .select("id, kind, image_url, original_image_url, selected, sort_order")
            .eq("workflow_id", w.id)
            .eq("kind", kind)
            .order("sort_order", { ascending: true });
          images = (imgs ?? []).map((im: any) => ({
            ...im,
            image_url: toSiteMediaUrl(im.image_url),
            original_image_url: toSiteMediaUrl(im.original_image_url),
          }));
        }
        return {
          id: w.id as string,
          booking: bookingById.get(w.booking_id) ?? null,
          stage,
          images,
          max_proof_selections: w.max_proof_selections as number | null,
          proof_selection_submitted_at: w.proof_selection_submitted_at as string | null,
          guided_selection_enabled: w.guided_selection_enabled as boolean,
          all_photos_unlocked: w.all_photos_unlocked as boolean,
          unlock_receipt_submitted_at: w.unlock_receipt_submitted_at as string | null,
          client_step: (w.client_step ?? 1) as number,
        };
      }),
    );
    return galleries;
  });

const toggleSchema = z.object({ imageId: z.string().uuid(), selected: z.boolean() });

/** Lets a customer mark/unmark a proof photo as a favorite — validates ownership and that the workflow is still in proofs_ready, server-side. */
export const toggleProofSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => toggleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: img, error: imgErr } = await supabaseAdmin
      .from("photo_client_images")
      .select("id, kind, workflow_id")
      .eq("id", data.imageId)
      .single();
    if (imgErr || !img) throw new Error("תמונה לא נמצאה");
    if (img.kind !== "proof") throw new Error("אפשר לסמן רק תמונות הוכחה");

    const { data: wf, error: wfErr } = await (supabaseAdmin as any)
      .from("photo_client_workflows")
      .select("id, stage, user_id, max_proof_selections, proof_selection_submitted_at, guided_selection_enabled")
      .eq("id", img.workflow_id)
      .single();
    if (wfErr || !wf) throw new Error("תהליך עבודה לא נמצא");
    if (wf.stage !== "proofs_ready") throw new Error("שלב בחירת התמונות כבר לא פעיל");
    if (wf.user_id !== userId) throw new Error("אין הרשאה");
    if (wf.proof_selection_submitted_at) throw new Error("הבחירה כבר נשלחה — אי אפשר לשנות אותה יותר");

    // Guided mode (two-phase: pick freely, then narrow down) deliberately
    // does NOT block selecting past the limit here — the limit is only
    // enforced at submit time (see submitProofSelection), so she can
    // over-select first and remove down to the right count afterward, per
    // explicit request. The plain (non-guided) flow keeps the original,
    // simpler behavior: blocked from ever exceeding the limit.
    if (data.selected && wf.max_proof_selections != null && !wf.guided_selection_enabled) {
      const { count } = await supabaseAdmin
        .from("photo_client_images")
        .select("id", { count: "exact", head: true })
        .eq("workflow_id", wf.id)
        .eq("selected", true);
      if ((count ?? 0) >= wf.max_proof_selections) {
        throw new Error(`אפשר לבחור עד ${wf.max_proof_selections} תמונות`);
      }
    }

    const { error } = await supabaseAdmin.from("photo_client_images").update({ selected: data.selected }).eq("id", data.imageId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const submitSelectionSchema = z.object({ workflowId: z.string().uuid() });

/**
 * Customer-facing "סיימתי לבחור" — finalizes her proof picks: marks the
 * submission timestamp (locks further toggling, see toggleProofSelection
 * above), auto-advances the workflow to edited_uploaded (same stage the
 * admin would otherwise move it to by hand once she's done), and notifies
 * the studio both ways per explicit request — an admin_notifications row
 * (shows in the "הודעות מערכת" bell/list already read by
 * listAdminNotifications) AND an email, both naming exactly which photos
 * were picked, not just a count.
 */
export const submitProofSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitSelectionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: wf, error: wfErr } = await (supabaseAdmin as any)
      .from("photo_client_workflows")
      .select("id, stage, user_id, booking_id, proof_selection_submitted_at, max_proof_selections")
      .eq("id", data.workflowId)
      .single();
    if (wfErr || !wf) throw new Error("תהליך עבודה לא נמצא");
    if (wf.user_id !== userId) throw new Error("אין הרשאה");
    if (wf.stage !== "proofs_ready") throw new Error("שלב בחירת התמונות כבר לא פעיל");
    if (wf.proof_selection_submitted_at) throw new Error("הבחירה כבר נשלחה");

    const { data: selectedImages, error: imgErr } = await supabaseAdmin
      .from("photo_client_images")
      .select("id, image_url, sort_order")
      .eq("workflow_id", wf.id)
      .eq("kind", "proof")
      .eq("selected", true)
      .order("sort_order", { ascending: true });
    if (imgErr) throw new Error(imgErr.message);
    if (!selectedImages || selectedImages.length === 0) throw new Error("יש לבחור לפחות תמונה אחת לפני השליחה");
    // Always enforced here regardless of guided/plain mode — the plain
    // flow never lets her exceed the limit in the first place (see
    // toggleProofSelection), so this is a no-op there; in guided mode this
    // is the actual enforcement point, since over-selecting is allowed
    // until she narrows down.
    if (wf.max_proof_selections != null && selectedImages.length > wf.max_proof_selections) {
      throw new Error(`נבחרו ${selectedImages.length} תמונות — יש להסיר עוד ${selectedImages.length - wf.max_proof_selections} כדי להגיע ל-${wf.max_proof_selections}`);
    }

    const now = new Date().toISOString();
    // The real, load-bearing update (proof_selection_submitted_at + stage)
    // is kept SEPARATE from the client_step write below — client_step is a
    // brand-new column that may not have landed on the live database yet
    // (the usual Lovable/Drizzle migration lag), and a missing column must
    // never block the actual proof-selection submission, which is what
    // every customer is doing right now when this runs.
    const { error: updErr } = await (supabaseAdmin as any)
      .from("photo_client_workflows")
      .update({ proof_selection_submitted_at: now, stage: "edited_uploaded", updated_at: now })
      .eq("id", wf.id);
    if (updErr) throw new Error(updErr.message);

    // client_step: advance to 3 ("בחירת כיתובים, תמונות לקולאז' וכריכה") —
    // step 2 ("בחירת תמונות") is exactly what she just finished. Best-effort
    // and separate from the update above for exactly the reason in the
    // comment there.
    const { error: stepErr } = await (supabaseAdmin as any).from("photo_client_workflows").update({ client_step: 3 }).eq("id", wf.id);
    if (stepErr) console.error("[SWEETBABY] client_step advance failed (column may not be live yet)", stepErr);

    let contactName = "";
    if (wf.booking_id) {
      const { data: booking } = await supabaseAdmin.from("bookings").select("contact_name").eq("id", wf.booking_id).maybeSingle();
      contactName = booking?.contact_name || "";
    }
    if (!contactName) {
      const { data: profile } = await supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
      contactName = profile?.full_name || "";
    }

    try {
      await supabaseAdmin.from("admin_notifications").insert({
        type: "proof_selection",
        title: `${contactName || "לקוחה"} בחרה ${selectedImages.length} תמונות`,
        body: { workflow_id: wf.id, contact_name: contactName, count: selectedImages.length, image_urls: selectedImages.map((i: any) => i.image_url) },
      });
    } catch (e) {
      console.error("[SWEETBABY] admin_notifications write for proof selection failed", e);
    }

    try {
      const {
        data: { user },
      } = await supabaseAdmin.auth.admin.getUserById(userId);
      const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
      const thumbsHtml = selectedImages
        .slice(0, 60)
        .map((i: any) => `<img src="${i.image_url}" alt="" width="110" height="110" style="object-fit:cover;border-radius:8px;margin:3px" />`)
        .join("");
      await sendStudioAndCustomer({
        customerEmail: user?.email,
        subject: `${contactName || "לקוחה"} שלחה בחירת תמונות — ${selectedImages.length} תמונות · Sweetbaby`,
        html: `<div dir="rtl" style="font-family:sans-serif">
          <p>${contactName ? contactName + " " : ""}שלחה את הבחירה הסופית — ${selectedImages.length} תמונות:</p>
          <div>${thumbsHtml}</div>
          <p style="margin-top:12px">התמונות עוברות עכשיו לעיבוד.</p>
        </div>`,
      });
    } catch (e) {
      console.error("[SWEETBABY] proof-selection confirmation email failed", e);
    }

    return { ok: true, count: selectedImages.length };
  });

// ---------- "כל התמונות בלי סימן מים" unlock (150₪ add-on) ----------
// Per explicit request: a client can get a ZIP of every proof photo at
// full quality, no watermark, for a 150₪ add-on — either by uploading a
// payment receipt (same `receipts` storage bucket/path convention as the
// studio-rental deposit flow in deposit.$type.$id.tsx) that the admin then
// reviews and approves, or the admin can just pre-approve it directly with
// no receipt at all (e.g. already bundled into a client's package).
// all_photos_unlocked/unlock_receipt_path/unlock_receipt_submitted_at are
// brand-new columns — cast past the generated types (same reasoning as
// every other very-new column in this file; see photo_client_workflows'
// own migration history for how often an external regen strips these
// before the real migration has landed, so casting avoids re-patching
// types.ts over and over for columns not core to query shape anyway).

const submitUnlockReceiptSchema = z.object({ workflowId: z.string().uuid(), receiptPath: z.string().min(1) });

/** Customer-facing — the file itself is uploaded client-side to the `receipts` bucket first (same as the deposit page); this just records the path and notifies the studio for review. */
export const submitAllPhotosUnlockReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitUnlockReceiptSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: wf, error: wfErr } = await (supabaseAdmin as any)
      .from("photo_client_workflows")
      .select("id, user_id, booking_id, all_photos_unlocked")
      .eq("id", data.workflowId)
      .single();
    if (wfErr || !wf) throw new Error("תהליך עבודה לא נמצא");
    if (wf.user_id !== userId) throw new Error("אין הרשאה");
    if (wf.all_photos_unlocked) return { ok: true };

    const now = new Date().toISOString();
    const { error } = await (supabaseAdmin as any)
      .from("photo_client_workflows")
      .update({ unlock_receipt_path: data.receiptPath, unlock_receipt_submitted_at: now })
      .eq("id", wf.id);
    if (error) throw new Error(error.message);

    let contactName = "";
    if (wf.booking_id) {
      const { data: booking } = await supabaseAdmin.from("bookings").select("contact_name").eq("id", wf.booking_id).maybeSingle();
      contactName = booking?.contact_name || "";
    }
    try {
      await supabaseAdmin.from("admin_notifications").insert({
        type: "all_photos_unlock_receipt",
        title: `${contactName || "לקוחה"} שלחה אסמכתא לפתיחת כל התמונות (150₪)`,
        body: { workflow_id: wf.id, contact_name: contactName },
      });
    } catch (e) {
      console.error("[SWEETBABY] admin_notifications write for unlock receipt failed", e);
    }
    return { ok: true };
  });

/** Admin-facing — signs the uploaded receipt so it can be viewed/reviewed. */
export const getAllPhotosUnlockReceiptUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => workflowIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: wf } = await (supabaseAdmin as any).from("photo_client_workflows").select("unlock_receipt_path").eq("id", data.workflowId).maybeSingle();
    if (!wf?.unlock_receipt_path) return { url: null };
    const { data: signed } = await supabaseAdmin.storage.from("receipts").createSignedUrl(wf.unlock_receipt_path, 60 * 60);
    return { url: signed?.signedUrl ?? null };
  });

/** Admin-facing — approves the unlock, with or without a receipt on file (the admin's own call — e.g. pre-approved in advance for a client where it's bundled into the price). */
export const approveAllPhotosUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => workflowIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("photo_client_workflows").update({ all_photos_unlocked: true }).eq("id", data.workflowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

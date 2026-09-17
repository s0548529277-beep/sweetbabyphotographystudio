import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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

    const { data: workflow, error: wErr } = await supabaseAdmin
      .from("photo_client_workflows")
      .select(
        "id, user_id, booking_id, stage, session_date, session_time, location, package_type, photos_to_edit, album_upgrades, total_price, amount_paid, balance, has_package, wants_editing",
      )
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
      .select("id, user_id, booking_id, session_date, session_time, photos_to_edit, album_upgrades, total_price")
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

    const { buildPhotoContractHtml } = await import("@/lib/photoContract");
    const html = buildPhotoContractHtml({
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
 * publish album, etc.). Moving to `album_published` also emails the client
 * that her edited photos are ready — per explicit request, best-effort
 * (a failed email never blocks the stage update itself, same as every
 * other notification send in this file).
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

const addImageSchema = z.object({
  workflowId: z.string().uuid(),
  kind: z.enum(["proof", "edited"]),
  storagePath: z.string().min(1),
  imageUrl: z.string().url(),
});

/** Records one uploaded image (the actual file upload happens client-side to Storage first, same pattern as admin.items.tsx). */
export const addPhotoClientImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addImageSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("photo_client_images").insert({
      workflow_id: data.workflowId,
      kind: data.kind,
      storage_path: data.storagePath,
      image_url: data.imageUrl,
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
    const { data: img } = await supabaseAdmin.from("photo_client_images").select("storage_path").eq("id", data.imageId).maybeSingle();
    if (img?.storage_path) await supabaseAdmin.storage.from("items").remove([img.storage_path]);
    const { error } = await supabaseAdmin.from("photo_client_images").delete().eq("id", data.imageId);
    if (error) throw new Error(error.message);
    return { ok: true };
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
    const { data: workflows, error } = await supabase
      .from("photo_client_workflows")
      .select("id, stage, booking_id")
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
          const { data: imgs } = await supabase
            .from("photo_client_images")
            .select("id, kind, image_url, selected, sort_order")
            .eq("workflow_id", w.id)
            .eq("kind", kind)
            .order("sort_order", { ascending: true });
          images = imgs ?? [];
        }
        return { id: w.id as string, booking: bookingById.get(w.booking_id) ?? null, stage, images };
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

    const { data: wf, error: wfErr } = await supabaseAdmin
      .from("photo_client_workflows")
      .select("id, stage, user_id")
      .eq("id", img.workflow_id)
      .single();
    if (wfErr || !wf) throw new Error("תהליך עבודה לא נמצא");
    if (wf.stage !== "proofs_ready") throw new Error("שלב בחירת התמונות כבר לא פעיל");
    if (wf.user_id !== userId) throw new Error("אין הרשאה");

    const { error } = await supabaseAdmin.from("photo_client_images").update({ selected: data.selected }).eq("id", data.imageId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

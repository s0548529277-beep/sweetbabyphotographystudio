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
      .select("id, user_id, booking_id, stage, created_at")
      .order("created_at", { ascending: false });
    if (wErr) throw new Error(wErr.message);

    const bookingById = new Map((bookings ?? []).map((b: any) => [b.id, b]));
    const userIds = Array.from(new Set((workflows ?? []).map((w: any) => w.user_id)));
    const { data: profiles } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, phone").in("id", userIds)
      : { data: [] as any[] };
    const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    return (workflows ?? []).map((w: any) => {
      const booking = w.booking_id ? bookingById.get(w.booking_id) : null;
      const profile = profileById.get(w.user_id);
      return {
        id: w.id as string, // photo_client_workflows.id — what admin.photo-clients.tsx links on
        booking_id: w.booking_id as string | null,
        contact_name: booking?.contact_name || profile?.full_name || "—",
        contact_phone: booking?.contact_phone || profile?.phone || "—",
        session_date: booking?.session_date ?? null,
        stage: w.stage as WorkflowStage,
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
      .select("id, user_id, booking_id, stage")
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

    return { booking, workflow: { id: workflow.id as string, stage: workflow.stage as WorkflowStage }, images: images ?? [] };
  });

const advanceSchema = z.object({ workflowId: z.string().uuid(), stage: z.enum(WORKFLOW_STAGES) });

/** Admin manually moves a client's workflow to a given stage (confirm date, publish album, etc.). */
export const advancePhotoClientStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => advanceSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("photo_client_workflows")
      .update({ stage: data.stage, updated_at: new Date().toISOString() })
      .eq("id", data.workflowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

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

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

/** Fetches (or lazily creates) the workflow row for a photography booking. */
async function ensureWorkflow(supabaseAdmin: any, bookingId: string): Promise<{ id: string; stage: WorkflowStage }> {
  const { data: existing } = await supabaseAdmin.from("photo_client_workflows").select("id, stage").eq("booking_id", bookingId).maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await supabaseAdmin
    .from("photo_client_workflows")
    .insert({ booking_id: bookingId, stage: "booked" })
    .select("id, stage")
    .single();
  if (error || !created) throw new Error(error?.message ?? "יצירת תהליך עבודה נכשלה");
  return created;
}

// ---------- Admin ----------

/** Every photography booking (package='photography'), each with its workflow stage — creates missing workflow rows lazily. */
export const listPhotoClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: bookings, error } = await supabaseAdmin
      .from("bookings")
      .select("id, contact_name, contact_phone, session_date, start_time, status, deposit_status, price")
      .eq("package", "photography")
      .order("session_date", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = await Promise.all(
      (bookings ?? []).map(async (b: any) => {
        const wf = await ensureWorkflow(supabaseAdmin, b.id);
        return { ...b, workflow_id: wf.id, stage: wf.stage as WorkflowStage };
      }),
    );
    return rows;
  });

const bookingIdSchema = z.object({ bookingId: z.string().uuid() });

/** Full detail for one photography client — booking info + workflow + all images. */
export const getPhotoClientDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bookingIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error: bErr } = await supabaseAdmin
      .from("bookings")
      .select("id, contact_name, contact_phone, session_date, start_time, end_time, status, deposit_status, price")
      .eq("id", data.bookingId)
      .single();
    if (bErr || !booking) throw new Error(bErr?.message ?? "לקוחה לא נמצאה");

    const wf = await ensureWorkflow(supabaseAdmin, data.bookingId);
    const { data: images, error: imgErr } = await supabaseAdmin
      .from("photo_client_images")
      .select("*")
      .eq("workflow_id", wf.id)
      .order("sort_order", { ascending: true });
    if (imgErr) throw new Error(imgErr.message);

    return { booking, workflow: wf, images: images ?? [] };
  });

const advanceSchema = z.object({ bookingId: z.string().uuid(), stage: z.enum(WORKFLOW_STAGES) });

/** Admin manually moves a client's workflow to a given stage (confirm date, publish album, etc.). */
export const advancePhotoClientStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => advanceSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const wf = await ensureWorkflow(supabaseAdmin, data.bookingId);
    const { error } = await supabaseAdmin
      .from("photo_client_workflows")
      .update({ stage: data.stage, updated_at: new Date().toISOString() })
      .eq("id", wf.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const addImageSchema = z.object({
  bookingId: z.string().uuid(),
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
    const wf = await ensureWorkflow(supabaseAdmin, data.bookingId);
    const { error } = await supabaseAdmin.from("photo_client_images").insert({
      workflow_id: wf.id,
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
 * The signed-in customer's own photography bookings, each with its
 * workflow stage and the images she's actually allowed to see at that
 * stage: proofs (to pick favorites) once proofs_ready, the final edited
 * set once album_published — never the admin's edited-but-unpublished
 * drafts.
 */
export const getMyPhotoGalleries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: bookings, error } = await supabase
      .from("bookings")
      .select("id, session_date, start_time, contact_name")
      .eq("package", "photography")
      .eq("user_id", userId)
      .order("session_date", { ascending: false });
    if (error) throw new Error(error.message);

    const galleries = await Promise.all(
      (bookings ?? []).map(async (b: any) => {
        const { data: wf } = await supabase.from("photo_client_workflows").select("id, stage").eq("booking_id", b.id).maybeSingle();
        if (!wf) return { booking: b, stage: "booked" as WorkflowStage, images: [] as any[] };

        const stage = wf.stage as WorkflowStage;
        let kind: "proof" | "edited" | null = null;
        if (stage === "proofs_ready") kind = "proof";
        else if (stage === "album_published") kind = "edited";

        let images: any[] = [];
        if (kind) {
          const { data: imgs } = await supabase
            .from("photo_client_images")
            .select("id, kind, image_url, selected, sort_order")
            .eq("workflow_id", wf.id)
            .eq("kind", kind)
            .order("sort_order", { ascending: true });
          images = imgs ?? [];
        }
        return { booking: b, stage, images };
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
      .select("id, stage, booking_id")
      .eq("id", img.workflow_id)
      .single();
    if (wfErr || !wf) throw new Error("תהליך עבודה לא נמצא");
    if (wf.stage !== "proofs_ready") throw new Error("שלב בחירת התמונות כבר לא פעיל");

    const { data: booking } = await supabaseAdmin.from("bookings").select("user_id").eq("id", wf.booking_id).single();
    if (booking?.user_id !== userId) throw new Error("אין הרשאה");

    const { error } = await supabaseAdmin.from("photo_client_images").update({ selected: data.selected }).eq("id", data.imageId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

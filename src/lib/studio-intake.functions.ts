import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const intakeSchema = z.object({
  clientName: z.string().min(1).max(120),
  phone: z.string().min(5).max(40),
  email: z.string().email().max(200),
  sessionType: z.string().max(200).optional().default(""),
  sessionDate: z.string().max(200).optional().default(""),
  peopleCount: z.string().max(60).optional().default(""),
  babyAge: z.string().max(120).optional().default(""),
  cameraBrand: z.string().max(200).optional().default(""),
  flashExperience: z.string().max(200).optional().default(""),
  needProps: z.string().max(500).optional().default(""),
  specialRequests: z.string().max(2000).optional().default(""),
  familyRoom: z.string().max(120).optional().default(""),
  agreed: z.literal(true),
});

export const submitStudioIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => intakeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Save to DB. No email here on purpose — the signed agreement is sent
    // together with the booking confirmation at the end of the flow.
    const { data: row, error: insErr } = await supabase
      .from("studio_intake_forms")
      .insert({
        user_id: userId,
        payload: JSON.parse(JSON.stringify(data)),
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    // Admin notification row (best-effort)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("admin_notifications").insert({
        type: "studio_intake",
        title: `טופס תיאום ציפיות · ${data.clientName}`,
        body: JSON.parse(JSON.stringify(data)),
      });
    } catch (e) {
      console.error("[SWEETBABY] intake admin notify failed", e);
    }

    // Tie the visitor's browsing history to the questionnaire (consent only, best-effort, never throws).
    try {
      const { linkVisitorFromRequest } = await import("@/lib/visitor-tracking.server");
      await linkVisitorFromRequest({ kind: "intake", refId: String(row?.id ?? userId), name: data.clientName, phone: data.phone, email: data.email });
    } catch {
      /* ignore */
    }

    return { ok: true, id: row?.id ?? null };
  });


async function assertAdminUser(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

/** Admin: loads the signed coordination-agreement payload of a studio booking (by booking_id, else the customer's latest) for editing. */
export const adminGetBookingIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminUser(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("id, user_id, contact_name, contact_phone, contact_email")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!booking) throw new Error("השריון לא נמצא");
    let row: any = null;
    const byBooking = await supabaseAdmin
      .from("studio_intake_forms")
      .select("id, payload, created_at")
      .eq("booking_id", data.bookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    row = byBooking.data;
    if (!row && booking.user_id) {
      const byUser = await supabaseAdmin
        .from("studio_intake_forms")
        .select("id, payload, created_at")
        .eq("user_id", booking.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      row = byUser.data;
    }
    return {
      payload: (row?.payload ?? null) as Record<string, string> | null,
      contact: { name: booking.contact_name ?? "", phone: booking.contact_phone ?? "", email: booking.contact_email ?? "" },
    };
  });

/** Admin: saves an edited coordination agreement for a studio booking, even after the rental is closed. Sends no mail and no notification. */
export const adminSaveBookingIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ bookingId: z.string().uuid(), payload: intakeSchema.extend({ agreed: z.literal(true) }) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdminUser(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("id, user_id")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!booking) throw new Error("השריון לא נמצא");
    const payload = JSON.parse(JSON.stringify(data.payload));
    const { data: existing } = await supabaseAdmin
      .from("studio_intake_forms")
      .select("id")
      .eq("booking_id", data.bookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabaseAdmin.from("studio_intake_forms").update({ payload }).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("studio_intake_forms")
        .insert({ booking_id: data.bookingId, user_id: booking.user_id ?? null, payload });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

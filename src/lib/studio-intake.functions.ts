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

    return { ok: true, id: row?.id ?? null };
  });


import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  email: z.string().min(3).max(200).email(),
  source: z.string().max(80).optional(),
});

// Public lead-capture endpoint (no auth) — backs the "get 15% off" email
// signup in the footer. Writes go through the service-role client so
// newsletter_signups needs no anon insert policy (see its migration).
export const subscribeNewsletter = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("newsletter_signups")
      .upsert({ email, source: data.source ?? null }, { onConflict: "email", ignoreDuplicates: true });
    if (error) throw new Error("ההרשמה נכשלה, נסי שוב");
    return { ok: true };
  });

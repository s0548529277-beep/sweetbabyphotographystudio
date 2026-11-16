import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Manual tzintuk (ring, no message) to a photography client. The ONLY way a
 * tzintuk goes out besides the customer-initiated phone password reset —
 * automatic ones were switched off on 2026-11-16 (owner request). The optional
 * `message` is stored as the pending message she hears when she calls back.
 */
export const sendManualTzintuk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      phone: z.string().trim().min(7).max(20),
      name: z.string().trim().max(120).optional(),
      message: z.string().trim().max(400).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!roles?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
    const { sendYemotVoiceMessage } = await import("@/integrations/yemot/campaign.server");
    const text =
      data.message ||
      `שלום${data.name ? ` ${data.name}` : ""}, כאן מיכל סיבוני. ניסיתי להשיג אותך — אשמח שתחזרי אליי.`;
    const ok = await sendYemotVoiceMessage({
      phone: data.phone,
      text,
      label: `צינתוק ידני ${data.name ?? ""}`.trim(),
      force: true,
    });
    return { ok };
  });

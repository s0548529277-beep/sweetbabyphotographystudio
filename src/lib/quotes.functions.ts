// Admin-only server functions for the price quotes (admin → "הצעות מחיר"): preview and send by e-mail.
// The client only sends a template id + name + address; the HTML is always built here from the template.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { QUOTE_TEMPLATES, buildQuote, isQuoteTemplateId } from "@/lib/quote-templates";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

const Base = z.object({
  templateId: z.string().refine(isQuoteTemplateId, "תבנית לא מוכרת"),
  clientName: z.string().trim().max(100).default(""),
});

export const listQuoteTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return QUOTE_TEMPLATES;
  });

export const previewQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Base.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    return buildQuote(data.templateId as any, data.clientName);
  });

export const sendQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Base.extend({ to: z.string().trim().email().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { subject, html } = buildQuote(data.templateId as any, data.clientName);
    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const ok = await sendGmail({ to: data.to, subject, html, fromName: "מיכל סיבוני" });
    if (!ok) throw new Error("השליחה נכשלה");
    return { ok: true };
  });

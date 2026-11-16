// Admin API for the studio's mailing list + newsletter sending (ported from the photographer site).
// Recipients = public.newsletter_signups with status 'subscribed' (the same list the site's sign-up forms fill).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_NEWSLETTER_DRAFT,
  NEWSLETTER_DRAFT_KEY,
  UNSUB_PLACEHOLDER,
  renderNewsletterHtml,
  type NewsletterDraft,
} from "@/lib/newsletter-template";

const SITE_URL = "https://sweetbabyphoto.shop";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

const draftSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  headline: z.string().trim().min(1).max(200),
  intro: z.string().max(500),
  body: z.string().max(5000),
  imageUrl: z.string().max(900),
  buttonText: z.string().max(80),
  buttonUrl: z.string().max(600),
});

export const getNewsletterDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = await admin();
    const { data } = await db.from("app_settings").select("value").eq("key", NEWSLETTER_DRAFT_KEY).maybeSingle();
    let draft: NewsletterDraft = DEFAULT_NEWSLETTER_DRAFT;
    try {
      if (data?.value) draft = { ...DEFAULT_NEWSLETTER_DRAFT, ...JSON.parse(data.value) };
    } catch {
      // fall back to the default template
    }
    const { data: last } = await db
      .from("newsletter_campaigns")
      .select("id,subject,total,sent_count,failed_count,created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    const { count } = await db.from("newsletter_signups").select("id", { count: "exact", head: true }).eq("status", "subscribed");
    return {
      draft,
      activeCount: (count ?? 0) as number,
      campaigns: (last ?? []) as { id: string; subject: string; total: number; sent_count: number; failed_count: number; created_at: string }[],
    };
  });

export const saveNewsletterDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => draftSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = await admin();
    const { error } = await db
      .from("app_settings")
      .upsert({ key: NEWSLETTER_DRAFT_KEY, value: JSON.stringify(data), updated_by: context.userId }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendNewsletterTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ draft: draftSchema, to: z.string().email().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const ok = await sendGmail({
      to: data.to,
      subject: `[בדיקה] ${data.draft.subject}`,
      html: renderNewsletterHtml(data.draft, `${SITE_URL}/unsubscribe/test`),
    });
    if (!ok) throw new Error("שליחת המייל נכשלה — בדקי שחיבור Gmail מוגדר");
    return { ok: true };
  });

/** Step 1 of a send: snapshots the draft and counts recipients. The browser then calls sendNewsletterBatch until done. */
export const startNewsletterCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => draftSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = await admin();
    const { count } = await db.from("newsletter_signups").select("id", { count: "exact", head: true }).eq("status", "subscribed");
    if (!count) throw new Error("אין נרשמים פעילים ברשימה");
    const { data: row, error } = await db
      .from("newsletter_campaigns")
      .insert({ subject: data.subject, draft: data, total: count })
      .select("id")
      .single();
    if (error || !row) throw new Error("יצירת השליחה נכשלה");
    return { campaignId: row.id as string, total: count as number };
  });

const BATCH = 15;

export const sendNewsletterBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid(), offset: z.number().int().min(0) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = await admin();
    const { data: camp } = await db.from("newsletter_campaigns").select("*").eq("id", data.campaignId).maybeSingle();
    if (!camp) throw new Error("השליחה לא נמצאה");
    // Stable order, so offsets never skip or repeat a recipient.
    const { data: recips } = await db
      .from("newsletter_signups")
      .select("email,unsubscribe_token")
      .eq("status", "subscribed")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(data.offset, data.offset + BATCH - 1);
    const list = (recips ?? []) as { email: string; unsubscribe_token: string }[];
    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const draft = camp.draft as NewsletterDraft;
    const template = renderNewsletterHtml(draft);
    let sent = 0;
    let failed = 0;
    for (const r of list) {
      const html = template.split(UNSUB_PLACEHOLDER).join(`${SITE_URL}/unsubscribe/${r.unsubscribe_token}`);
      const ok = await sendGmail({ to: r.email, subject: draft.subject, html });
      if (ok) sent++;
      else failed++;
    }
    const done = list.length < BATCH;
    await db
      .from("newsletter_campaigns")
      .update({
        sent_count: camp.sent_count + sent,
        failed_count: camp.failed_count + failed,
        ...(done ? { finished_at: new Date().toISOString() } : {}),
      })
      .eq("id", camp.id);
    return { sent, failed, processed: list.length, nextOffset: data.offset + list.length, done };
  });

/** Admin: remove / restore a subscriber without deleting the row (unsubscribed people are skipped when sending). */
export const setSubscriberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), action: z.enum(["subscribe", "unsubscribe"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = await admin();
    const { error } = await db
      .from("newsletter_signups")
      .update(data.action === "subscribe" ? { status: "subscribed", unsubscribed_at: null } : { status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Public: one-click unsubscribe from the link at the bottom of every newsletter. */
export const unsubscribeByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows, error } = await db
      .from("newsletter_signups")
      .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
      .eq("unsubscribe_token", data.token)
      .select("id");
    if (error) throw new Error("ההסרה נכשלה, נסי שוב");
    return { ok: (rows ?? []).length > 0 };
  });

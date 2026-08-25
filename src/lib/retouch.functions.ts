import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Lovable AI Gateway model id for Gemini's image-editing model ("Nano
// Banana") — accepts multiple reference images + a text instruction and
// returns an edited image. If Lovable ever renames/updates the id this
// gateway expects, this is the only place to change it.
const RETOUCH_MODEL_ID = "google/gemini-2.5-flash-image";

// Basic per-session anti-abuse limit — each generation is a paid API call.
const MAX_GENERATIONS_PER_DAY = 8;

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,([a-zA-Z0-9+/=]+)$/;

const RetouchInput = z.object({
  presetId: z.string().uuid(),
  // Client-generated (crypto.randomUUID, kept in localStorage) — purely for
  // context on the usage log now that every request is authenticated; the
  // rate limit itself is keyed off the real user id below.
  sessionId: z.string().min(8).max(80),
  // A single data: URL, already downscaled/compressed client-side. Capped
  // well above what a downscaled photo needs, to keep request bodies and
  // model cost bounded.
  imageDataUrl: z.string().max(7_000_000),
});

export const generateRetouchPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RetouchInput.parse(data))
  .handler(async ({ data, context }) => {
    const match = DATA_URL_RE.exec(data.imageDataUrl);
    if (!match) throw new Error("פורמט תמונה לא נתמך — נסו תמונת JPG/PNG/WebP אחרת.");
    const inputBase64 = match[2];

    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // retouch_presets / retouch_usage_log / retouch_allowed_clients are new
    // tables — cast until the generated Database type (types.ts) picks
    // them up on next generation.
    const db = supabaseAdmin as any;

    // Feature is gated to hand-picked clients — granted by email (from
    // "ניהול לקוחות" or directly on the retouch admin page), so someone
    // with no site account yet can still be granted access in advance.
    // Admins always have access so the studio can test freely.
    const { data: roleRows } = await db.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = !!roleRows?.some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) {
      const email = ((context.claims as { email?: string } | undefined)?.email ?? "")
        .trim()
        .toLowerCase();
      const { data: allowed } = email
        ? await db.from("retouch_allowed_clients").select("email").eq("email", email).maybeSingle()
        : { data: null };
      if (!allowed) {
        throw new Error("התכונה הזו זמינה כרגע ללקוחות נבחרים בלבד. פנו לסטודיו לבדיקת זכאות.");
      }
    }

    // Rate limit: count successful generations for this user in the last
    // 24h. Checked before touching the paid API.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from("retouch_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("success", true)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_GENERATIONS_PER_DAY) {
      throw new Error(
        `הגעתם למכסת ${MAX_GENERATIONS_PER_DAY} עיבודים ליום. נסו שוב מחר, או צרו קשר עם הסטודיו.`,
      );
    }

    const { data: preset, error: presetErr } = await db
      .from("retouch_presets")
      .select("id, name, prompt, before_url, after_url")
      .eq("id", data.presetId)
      .eq("is_active", true)
      .maybeSingle();
    if (presetErr || !preset) throw new Error("הסגנון המבוקש לא נמצא או שאינו זמין יותר.");

    const logFailure = async (error: string) => {
      try {
        await db.from("retouch_usage_log").insert({
          preset_id: preset.id,
          session_id: data.sessionId,
          user_id: userId,
          success: false,
          error,
        });
      } catch (e) {
        console.error("[SWEETBABY] retouch usage log (failure) insert failed", e);
      }
    };

    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      await logFailure("Missing LOVABLE_API_KEY");
      throw new Error("שירות עיבוד התמונות אינו מוגדר כרגע. נסו שוב מאוחר יותר.");
    }
    const gateway = createLovableAiGatewayProvider(key);

    const promptText = `את/ה עורך/ת תמונות מקצועי/ת. תיאור סגנון העריכה המבוקש: "${preset.prompt}".
התמונה הראשונה (BEFORE) והשנייה (AFTER) הן דוגמה שממחישה את סוג העריכה — למד/י מהן רק את סוג ועוצמת השינוי, אל תעתיק/י את התוכן שלהן.
התמונה השלישית היא תמונה חדשה של אדם אמיתי. החזר/י גרסה ערוכה של התמונה השלישית בלבד, באותו סגנון עריכה בדיוק, תוך שמירה קפדנית על זהות האדם, הפוזה, התאורה, הרקע והבגדים המקוריים. אל תוסיף/י טקסט, מסגרת, לוגו או סימן מים. החזר/י אך ורק את התמונה הערוכה.`;

    let result: { text: string; files?: Array<{ mediaType?: string; base64?: string }> };
    try {
      // `files` (generated non-text output, e.g. images) isn't in every
      // pinned version of the 'ai' package's TS types — read it loosely
      // and validate at runtime instead of trusting the type.
      result = (await generateText({
        model: gateway(RETOUCH_MODEL_ID),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptText },
              { type: "image", image: new URL(preset.before_url) },
              { type: "image", image: new URL(preset.after_url) },
              { type: "image", image: inputBase64 },
            ],
          },
        ],
      })) as unknown as typeof result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[SWEETBABY] retouch generateText failed", msg);
      await logFailure(msg);
      throw new Error("עיבוד התמונה נכשל. נסו שוב בעוד רגע.");
    }

    const image = result.files?.find((f) => f.mediaType?.startsWith("image/") && f.base64);
    if (!image?.base64) {
      console.error("[SWEETBABY] retouch: model returned no image", result.text?.slice(0, 300));
      await logFailure("Model returned no image");
      throw new Error("לא התקבלה תמונה מעובדת. נסו תמונה אחרת או נסו שוב.");
    }

    try {
      await db.from("retouch_usage_log").insert({
        preset_id: preset.id,
        session_id: data.sessionId,
        user_id: userId,
        success: true,
      });
    } catch (e) {
      console.error("[SWEETBABY] retouch usage log (success) insert failed", e);
    }

    return { resultDataUrl: `data:${image.mediaType};base64,${image.base64}` };
  });

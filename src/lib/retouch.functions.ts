import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Lovable AI Gateway model id for Gemini's image-editing model ("Nano
// Banana") — accepts multiple reference images + a text instruction and
// returns an edited image.
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
    if (!DATA_URL_RE.test(data.imageDataUrl)) {
      throw new Error("פורמט תמונה לא נתמך — נסו תמונת JPG/PNG/WebP אחרת.");
    }

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

    const promptText = `את/ה עורך/ת תמונות מקצועי/ת. תיאור סגנון העריכה המבוקש: "${preset.prompt}".
התמונה הראשונה (BEFORE) והשנייה (AFTER) הן דוגמה שממחישה את סוג העריכה — למד/י מהן רק את סוג ועוצמת השינוי, אל תעתיק/י את התוכן שלהן.
התמונה השלישית היא תמונה חדשה של אדם אמיתי. החזר/י גרסה ערוכה של התמונה השלישית בלבד, באותו סגנון עריכה בדיוק, תוך שמירה קפדנית על זהות האדם, הפוזה, התאורה, הרקע והבגדים המקוריים. אל תוסיף/י טקסט, מסגרת, לוגו או סימן מים. החזר/י אך ורק את התמונה הערוכה.`;

    // Calling the gateway directly (not through the `ai` SDK's generateText)
    // — image output from an OpenAI-compatible chat endpoint isn't a
    // first-class Vercel-AI-SDK concept, so this reads the raw JSON itself.
    // Same proven approach as src/lib/photo-editor.functions.ts.
    let mediaType = "image/png";
    let base64: string | null = null;
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: RETOUCH_MODEL_ID,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: promptText },
                { type: "image_url", image_url: { url: preset.before_url } },
                { type: "image_url", image_url: { url: preset.after_url } },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
          ],
        }),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`שגיאה מהמודל (${res.status}): ${raw.slice(0, 500)}`);
      const json = JSON.parse(raw);
      const message = json?.choices?.[0]?.message;
      const fromImagesField = message?.images?.[0]?.image_url?.url as string | undefined;
      const fromContentField = typeof message?.content === "string" ? message.content : null;
      const dataUri = fromImagesField ?? fromContentField ?? "";
      const match2 = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUri);
      if (match2) {
        mediaType = match2[1];
        base64 = match2[2];
      }
      if (!base64)
        throw new Error(
          `המודל לא החזיר תמונה מעובדת. תגובה גולמית: ${JSON.stringify(json).slice(0, 500)}`,
        );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[SWEETBABY] retouch model call failed", msg);
      await logFailure(msg);
      throw new Error("עיבוד התמונה נכשל. נסו תמונה אחרת או נסו שוב בעוד רגע.");
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

    return { resultDataUrl: `data:${mediaType};base64,${base64}` };
  });

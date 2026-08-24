import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

// Style presets — starting with one (the "warm forest" cinematic grade the
// studio pointed to as a reference), meant to grow as more reference
// sketches/examples come in. Each preset only describes a color/light/mood
// treatment — never new content — precisely because the model must not
// invent anything that wasn't in the original photo.
export const PHOTO_EDIT_STYLES: Record<string, { label: string; prompt: string }> = {
  warm_forest: {
    label: "יער חם — טונים חמים וקולנועיים",
    prompt:
      "גוונים חמים (חום-כתום-זהב), תאורה רכה ומוזהבת שנראית כאילו מגיעה מאחור (backlight), ניגודיות עדינה עם צללים עמוקים אך חמים, רקע מעט חלומי ומטושטש קלות, אווירה קולנועית ורגועה.",
  },
  custom: {
    label: "עיבוד חופשי — לפי הוראה בטקסט",
    prompt: "",
  },
};

const editSchema = z.object({
  imageUrl: z.string().url(),
  style: z.enum(Object.keys(PHOTO_EDIT_STYLES) as [string, ...string[]]),
  includeFace: z.boolean(),
  intensity: z.enum(["light", "strong"]),
  // Extra free-text instructions — always available alongside any preset
  // style, not only in "custom" mode, so a preset can be nudged/refined
  // without needing a brand-new preset for every small variation.
  customInstructions: z.string().max(500).optional(),
});

function buildEditPrompt(style: string, includeFace: boolean, intensity: "light" | "strong", customInstructions?: string): string {
  const stylePrompt = PHOTO_EDIT_STYLES[style]?.prompt ?? "";
  const facePrompt = includeFace
    ? "אפשר גם רטוש עור עדין ואחיד לפנים — החלקה קלה בלבד. אסור לשנות תווי פנים, גיל, זהות, הבעה או צורת הפנים."
    : "אין לגעת בפנים בכלל — יש להשאיר אותן בדיוק כפי שהן במקור, ללא שום שינוי.";
  const intensityPrompt =
    intensity === "strong"
      ? "עוצמת עיבוד ברורה וחזקה יחסית, אבל עדיין ריאליסטית."
      : "עוצמת עיבוד עדינה ומינימלית — שינוי קל בלבד.";
  const customPrompt = customInstructions?.trim() ? `הוראה נוספת מהצלמת: ${customInstructions.trim()}` : "";
  return [
    "את עורכת תמונות מקצועית של סטודיו צילום ניו-בורן ומשפחה.",
    "חשוב מאוד: שמרי בדיוק על התוכן המקורי של התמונה — אותם אנשים, אותה זהות, אותה תנוחה, אותם עצמים ואותו רקע פיזי. אל תמציאי ואל תוסיפי שום פרט חדש שלא היה בתמונה המקורית. רק עבדי צבע, תאורה, גוון ומרקם.",
    stylePrompt,
    customPrompt,
    facePrompt,
    intensityPrompt,
    "החזירי אך ורק את התמונה הערוכה, בלי טקסט נלווה.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Runs one AI-edited version of an already-uploaded photo (original_url is
 * a Supabase Storage URL) and saves it as a new photo_edit_history row.
 * Best-effort by design: on failure the row is marked "failed" with the
 * error message instead of disappearing, so admin.photo-editor.tsx can show
 * exactly what went wrong instead of a silent nothing.
 */
export const editPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => editSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: historyRow, error: histErr } = await supabaseAdmin
      .from("photo_edit_history")
      .insert({
        admin_user_id: context.userId,
        style: data.style,
        include_face: data.includeFace,
        intensity: data.intensity,
        custom_instructions: data.customInstructions?.trim() || null,
        original_url: data.imageUrl,
        status: "processing",
      })
      .select("id")
      .single();
    if (histErr || !historyRow) throw new Error(histErr?.message ?? "יצירת רשומת היסטוריה נכשלה");

    try {
      const key = process.env.LOVABLE_API_KEY;
      if (!key) throw new Error("Missing LOVABLE_API_KEY");
      const prompt = buildEditPrompt(data.style, data.includeFace, data.intensity, data.customInstructions);

      // Calling the gateway directly (not through the `ai` SDK's generateText)
      // for this one — image-output from an OpenAI-compatible chat endpoint
      // isn't a Vercel-AI-SDK first-class concept the way it is for a native
      // image-generation provider, so it's safer to read the raw JSON
      // ourselves and check the couple of shapes different gateways use for
      // this (message.images[].image_url.url, or a data: URI embedded in
      // message.content), and — if neither matches — surface a chunk of the
      // real raw response so a mismatch can be diagnosed from what actually
      // came back instead of a generic message.
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: data.imageUrl } },
              ],
            },
          ],
        }),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`שגיאה מהמודל (${res.status}): ${raw.slice(0, 500)}`);
      const json = JSON.parse(raw);
      const message = json?.choices?.[0]?.message;

      let mediaType = "image/png";
      let base64: string | null = null;
      const fromImagesField = message?.images?.[0]?.image_url?.url as string | undefined;
      const fromContentField = typeof message?.content === "string" ? message.content : null;
      const dataUri = fromImagesField ?? fromContentField ?? "";
      const match = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
      if (match) {
        mediaType = match[1];
        base64 = match[2];
      }

      if (!base64) {
        const snippet = JSON.stringify(json).slice(0, 500);
        throw new Error(`המודל לא החזיר תמונה מעובדת. תגובה גולמית: ${snippet}`);
      }

      const ext = mediaType.split("/")[1]?.split("+")[0] ?? "png";
      const path = `photo-editor/${historyRow.id}.${ext}`;
      const bytes = Buffer.from(base64, "base64");
      const { error: upErr } = await supabaseAdmin.storage
        .from("items")
        .upload(path, bytes, { contentType: mediaType, upsert: true });
      if (upErr) throw new Error(upErr.message);

      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from("items")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signErr || !signed?.signedUrl) throw new Error(signErr?.message ?? "יצירת קישור לתמונה המעובדת נכשלה");

      await supabaseAdmin
        .from("photo_edit_history")
        .update({ status: "done", edited_url: signed.signedUrl })
        .eq("id", historyRow.id);
      return { id: historyRow.id, editedUrl: signed.signedUrl };
    } catch (e: any) {
      const message = e?.message ?? "שגיאה לא צפויה";
      await supabaseAdmin.from("photo_edit_history").update({ status: "failed", error_message: message }).eq("id", historyRow.id);
      throw new Error(message);
    }
  });

export const listPhotoEditHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("photo_edit_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

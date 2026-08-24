import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

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
};

const editSchema = z.object({
  imageUrl: z.string().url(),
  style: z.enum(Object.keys(PHOTO_EDIT_STYLES) as [string, ...string[]]),
  includeFace: z.boolean(),
  intensity: z.enum(["light", "strong"]),
});

function buildEditPrompt(style: string, includeFace: boolean, intensity: "light" | "strong"): string {
  const stylePrompt = PHOTO_EDIT_STYLES[style]?.prompt ?? "";
  const facePrompt = includeFace
    ? "אפשר גם רטוש עור עדין ואחיד לפנים — החלקה קלה בלבד. אסור לשנות תווי פנים, גיל, זהות, הבעה או צורת הפנים."
    : "אין לגעת בפנים בכלל — יש להשאיר אותן בדיוק כפי שהן במקור, ללא שום שינוי.";
  const intensityPrompt =
    intensity === "strong"
      ? "עוצמת עיבוד ברורה וחזקה יחסית, אבל עדיין ריאליסטית."
      : "עוצמת עיבוד עדינה ומינימלית — שינוי קל בלבד.";
  return [
    "את עורכת תמונות מקצועית של סטודיו צילום ניו-בורן ומשפחה.",
    "חשוב מאוד: שמרי בדיוק על התוכן המקורי של התמונה — אותם אנשים, אותה זהות, אותה תנוחה, אותם עצמים ואותו רקע פיזי. אל תמציאי ואל תוסיפי שום פרט חדש שלא היה בתמונה המקורית. רק עבדי צבע, תאורה, גוון ומרקם.",
    stylePrompt,
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
        original_url: data.imageUrl,
        status: "processing",
      })
      .select("id")
      .single();
    if (histErr || !historyRow) throw new Error(histErr?.message ?? "יצירת רשומת היסטוריה נכשלה");

    try {
      const key = process.env.LOVABLE_API_KEY;
      if (!key) throw new Error("Missing LOVABLE_API_KEY");
      const gateway = createLovableAiGatewayProvider(key);
      const prompt = buildEditPrompt(data.style, data.includeFace, data.intensity);

      const result = await generateText({
        model: gateway("google/gemini-2.5-flash-image"),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image", image: data.imageUrl },
            ],
          },
        ],
      });

      const generatedImage = result.files?.find((f) => f.mediaType?.startsWith("image/"));
      if (!generatedImage) throw new Error("המודל לא החזיר תמונה מעובדת — ייתכן שצריך לכוונן את החיבור למודל");

      const ext = generatedImage.mediaType?.split("/")[1]?.split("+")[0] ?? "png";
      const path = `photo-editor/${historyRow.id}.${ext}`;
      const bytes = generatedImage.uint8Array ?? Buffer.from(generatedImage.base64 ?? "", "base64");
      const { error: upErr } = await supabaseAdmin.storage
        .from("items")
        .upload(path, bytes, { contentType: generatedImage.mediaType ?? "image/png", upsert: true });
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

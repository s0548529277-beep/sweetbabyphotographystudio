// The paid "סינון AI" triage tier — per explicit request, a REAL AI vision
// call per photo (costs real money, unlike image-quality.ts's free
// client-side heuristics), asking a text-capable Gemini model to rate
// overall quality (blur/exposure/eyes-closed) so the admin can review the
// worst-scoring photos before sending anything to a client. Never deletes
// anything itself — purely advisory, same spirit as the free tier.
//
// Reuses the exact direct-fetch-to-Lovable-gateway pattern already proven
// in photo-editor.functions.ts's editPhoto (same endpoint, same auth
// header, same multimodal message shape) — just swapping the model for the
// plain text-capable "google/gemini-2.5-flash" (not the "-image" output
// variant editPhoto uses) and parsing a JSON object back out of the text
// response instead of hunting for a data-URI image.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

export type AiQualityScore = {
  imageUrl: string;
  overallScore: number | null; // 0-100, higher = better; null if the model call failed for this image
  blur: number | null; // 0-10, higher = blurrier
  exposure: number | null; // 0-10, higher = worse exposure (too dark/bright)
  eyesClosed: boolean | null;
  note: string;
};

const QUALITY_PROMPT =
  'את/ה בודק/ת איכות תמונת צילום סטודיו לתינוקות/משפחות. החזר/י אך ורק אובייקט JSON יחיד, בלי טקסט נוסף, בדיוק בצורה הזו: {"overallScore": <0-100, גבוה=טוב>, "blur": <0-10, גבוה=מטושטש יותר>, "exposure": <0-10, גבוה=חשיפה גרועה יותר>, "eyesClosed": <true|false>, "note": "<סיבה קצרה בעברית, עד 8 מילים>"}.';

async function scoreOne(imageUrl: string, key: string): Promise<AiQualityScore> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: QUALITY_PROMPT },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`שגיאה מהמודל (${res.status}): ${raw.slice(0, 300)}`);
    const json = JSON.parse(raw);
    const content = json?.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`המודל לא החזיר JSON: ${text.slice(0, 200)}`);
    const parsed = JSON.parse(match[0]);
    return {
      imageUrl,
      overallScore: typeof parsed.overallScore === "number" ? parsed.overallScore : null,
      blur: typeof parsed.blur === "number" ? parsed.blur : null,
      exposure: typeof parsed.exposure === "number" ? parsed.exposure : null,
      eyesClosed: typeof parsed.eyesClosed === "boolean" ? parsed.eyesClosed : null,
      note: typeof parsed.note === "string" ? parsed.note : "",
    };
  } catch (e: any) {
    console.error("[SWEETBABY] AI photo-quality scoring failed for one image", e);
    return { imageUrl, overallScore: null, blur: null, exposure: null, eyesClosed: null, note: e?.message ?? "שגיאה" };
  }
}

/** Runs `scoreOne` over up to this many images at once — bounds how hard a single admin click hammers the gateway, not a cost control (the cost is per-image regardless of concurrency). */
const CONCURRENCY = 4;

async function scoreBatch(imageUrls: string[]): Promise<AiQualityScore[]> {
  const key: string | undefined = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const apiKey: string = key;
  const results: AiQualityScore[] = new Array(imageUrls.length);
  let next = 0;
  async function worker() {
    while (next < imageUrls.length) {
      const i = next++;
      const url = imageUrls[i];
      if (url) results[i] = await scoreOne(url, apiKey);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, imageUrls.length) }, worker));
  return results;
}

const scoreSchema = z.object({ imageUrls: z.array(z.string().url()).min(1).max(60) });

/** Admin-only, explicit opt-in per upload batch (never automatic) — see PhotoTriagePanel.tsx's AI mode, which shows the per-photo cost warning before this is ever called. */
export const scorePhotoQualityBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scoreSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    return scoreBatch(data.imageUrls);
  });

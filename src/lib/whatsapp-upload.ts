import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";

export type OutgoingMediaType = "image" | "video" | "document" | "audio" | "sticker";

/** Uploads an outgoing file to the same "items" storage bucket the photo galleries already use and returns a signed URL — WhatsApp's Cloud API sends media by URL ("link" method). `asSticker` sends a .webp as a sticker (no compression, no caption). */
export async function uploadMediaToStorage(
  file: File,
  asSticker = false,
): Promise<{ url: string; type: OutgoingMediaType }> {
  let type: OutgoingMediaType;
  if (asSticker) {
    if (file.type !== "image/webp") throw new Error("מדבקה חייבת להיות קובץ webp (עד 500KB, 512x512)");
    if (file.size > 500 * 1024) throw new Error("המדבקה גדולה מדי — עד 500KB");
    type = "sticker";
  } else if (file.type.startsWith("image/")) type = "image";
  else if (file.type.startsWith("video/")) type = "video";
  else if (file.type.startsWith("audio/")) {
    // WhatsApp accepts aac, mp3, m4a (mp4), amr and ogg/opus — not webm/wav.
    if (!/audio\/(aac|mpeg|mp4|amr|ogg)/.test(file.type)) {
      throw new Error("פורמט ההקלטה לא נתמך בוואטסאפ — צריך mp3, m4a, aac, amr או ogg");
    }
    type = "audio";
  } else if (file.type === "application/pdf") type = "document";
  else throw new Error("סוג קובץ לא נתמך (תמונה, סרטון, הקלטה, מדבקה או PDF)");

  const toUpload = type === "image" ? await compressImage(file) : file;
  const ext = toUpload.name.split(".").pop() ?? "bin";
  const path = `whatsapp-outgoing/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("items").upload(path, toUpload, { upsert: false });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage
    .from("items")
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה ביצירת קישור לקובץ");
  return { url: data.signedUrl, type };
}


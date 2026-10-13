// Shared client-side upload to the `receipts` Storage bucket — same
// bucket/path convention already used by the studio-rental deposit flow
// (deposit.$type.$id.tsx), reused here for the "unlock all photos without
// a watermark" 150₪ add-on. Only the storage PATH is ever stored on the
// row (never a signed URL) — the admin gets a short-lived signed URL on
// demand when reviewing it (see getAllPhotosUnlockReceiptUrl).
import { supabase } from "@/integrations/supabase/client";

export async function uploadReceiptFile(file: File, userId: string, pathPrefix: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${userId}/${pathPrefix}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("receipts").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

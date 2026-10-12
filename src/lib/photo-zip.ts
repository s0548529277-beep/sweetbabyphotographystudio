// Client-side "download the whole album as a ZIP" for the final/edited
// photo gallery (my-photos.tsx) — per explicit request: always the
// full-quality original inside the zip (never the smaller display copy the
// gallery grid shows), with the client's own choice of watermarked or not.
// Built entirely in the browser (fetch each original, optionally stamp it,
// zip, download) — no server-side image work needed, same spirit as the
// rest of this app's canvas-based image handling (watermark.ts,
// image-compress.ts, the collage/photo-editor features).
import JSZip from "jszip";
import { watermarkBlob } from "@/lib/watermark";

export type ZipPhoto = { url: string; name: string };

/**
 * Downloads `photos`, optionally watermarking each one, zips them, and
 * triggers a browser save — all client-side. `onProgress` fires after each
 * photo so the caller can show "3/25" instead of one long silent wait.
 */
export async function downloadPhotosAsZip(photos: ZipPhoto[], opts: { watermark: boolean; zipName: string; onProgress?: (done: number, total: number) => void }): Promise<void> {
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const res = await fetch(photo.url);
    if (!res.ok) throw new Error(`הורדת תמונה נכשלה (${res.status})`);
    let blob = await res.blob();
    if (opts.watermark) blob = await watermarkBlob(blob);

    let name = photo.name;
    if (usedNames.has(name)) {
      const dot = name.lastIndexOf(".");
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      name = `${base}-${i + 1}${ext}`;
    }
    usedNames.add(name);
    zip.file(name, blob);
    opts.onProgress?.(i + 1, photos.length);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.zipName;
  a.click();
  URL.revokeObjectURL(url);
}

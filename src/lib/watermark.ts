/**
 * Client-side watermark stamp — the studio's own logo tiled diagonally
 * across the frame so it can't be cropped out, while the client can still
 * judge real image quality/detail while shopping for which photos to buy.
 * Originally proof-only and always-on; now reusable from two places:
 * `applyWatermark` (upload time, in admin.photo-clients.$bookingId.tsx) and
 * `watermarkBlob` (download time, in photo-zip.ts, composited fresh from
 * the full-quality original right before it goes into the client's ZIP —
 * so "with/without watermark" is a real choice on the ORIGINAL file, not
 * baked permanently into what's stored).
 */
import logoUrl from "@/assets/logo-green-hero.png";

let logoImagePromise: Promise<HTMLImageElement> | null = null;
function loadLogoImage(): Promise<HTMLImageElement> {
  if (!logoImagePromise) {
    logoImagePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("לוגו לא נטען"));
      img.src = logoUrl;
    });
  }
  return logoImagePromise;
}

/** Draws `source` onto a canvas at its own resolution (no resize) with the tiled logo overlay, and returns the result as a JPEG blob. Shared core of applyWatermark/watermarkBlob below. */
async function stampWatermark(source: ImageBitmap): Promise<Blob | null> {
  const { width, height } = source;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);

  const logo = await loadLogoImage();
  const logoW = Math.max(160, Math.round(Math.min(width, height) * 0.22));
  const logoH = logoW * (logo.naturalHeight / logo.naturalWidth);

  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.translate(width / 2, height / 2);
  ctx.rotate((-28 * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);
  const stepX = logoW * 2.3;
  const stepY = logoH * 3.4;
  // Over-cover the rotated canvas so corners get tiles too.
  const pad = Math.max(width, height) * 0.75;
  for (let y = -pad; y < height + pad; y += stepY) {
    for (let x = -pad; x < width + pad; x += stepX) {
      ctx.drawImage(logo, x, y, logoW, logoH);
    }
  }
  ctx.restore();

  // High JPEG quality (0.95, not compressImage's 0.85) — this is meant to
  // still read as "full quality" to the client, just watermarked.
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
}

export async function applyWatermark(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const blob = await stampWatermark(bitmap);
    bitmap.close?.();
    if (!blob) return file;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch (e) {
    console.error("[SWEETBABY] watermark failed, uploading original untouched", e);
    return file;
  }
}

/** Same stamp, but for an already-downloaded blob (e.g. a full-quality original being zipped up) rather than a fresh upload — used by photo-zip.ts. Returns the original blob untouched if anything goes wrong, same fallback spirit as applyWatermark. */
export async function watermarkBlob(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    const stamped = await stampWatermark(bitmap);
    bitmap.close?.();
    return stamped ?? blob;
  } catch (e) {
    console.error("[SWEETBABY] watermark (download-time) failed, using original untouched", e);
    return blob;
  }
}

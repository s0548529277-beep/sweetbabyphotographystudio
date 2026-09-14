/**
 * Client-side, full-resolution watermark stamp for photo-client "proof"
 * uploads — per explicit request: proofs upload in full quality (no
 * downscaling, unlike the normal compressImage() path every other upload
 * uses) with the studio's own logo tiled diagonally across the frame, so
 * it can't be cropped out and the client can still judge real image
 * quality/detail while shopping for which photos to buy. The final
 * "edited" delivery images are untouched by this — only kind="proof"
 * uploads go through it (see admin.photo-clients.$bookingId.tsx).
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

export async function applyWatermark(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Full original resolution — no resize, unlike compressImage.
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

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

    // High JPEG quality (0.95, not compressImage's 0.85) — this is meant
    // to still read as "full quality" to the client, just watermarked.
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) return file;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch (e) {
    console.error("[SWEETBABY] watermark failed, uploading original untouched", e);
    return file;
  }
}

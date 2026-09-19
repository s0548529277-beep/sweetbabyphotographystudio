/**
 * Configurable watermark stamp for the admin resize tool (/admin/photo-resize)
 * — unlike watermark.ts's applyWatermark (a fixed studio-logo stamp used for
 * photo-client proof uploads), this takes the logo image, size and opacity
 * as parameters, since that tool lets the admin upload any logo and control
 * how prominent it is per use.
 */

/** Loads a picked File into a drawable <img> element via an object URL (caller owns revoking it). */
export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("לא ניתן לטעון את התמונה"));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Tiles `logo` diagonally across `file` at full resolution.
 * @param sizePercent width of one logo tile, as % of the image's shorter side (5-60 sensible range)
 * @param opacityPercent 0-100
 */
export async function applyCustomWatermark(
  file: File,
  logo: HTMLImageElement,
  sizePercent: number,
  opacityPercent: number,
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const logoW = Math.max(30, Math.round(Math.min(width, height) * (sizePercent / 100)));
    const logoH = logoW * (logo.naturalHeight / logo.naturalWidth || 1);

    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, opacityPercent / 100));
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

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) return file;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } finally {
    bitmap.close?.();
  }
}

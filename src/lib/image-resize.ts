/**
 * Client-side image resize to an exact target — unlike compressImage()
 * (which silently skips files already under a size threshold, meant for
 * the upload pipeline), this always re-encodes to the given max dimension
 * and quality, since the admin resize tool (/admin/photo-resize) is meant
 * to give her explicit, predictable control over the output every time.
 */
export async function resizeImage(file: File, maxDim: number, quality: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("שגיאה ביצירת קנבס לעיבוד");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("שגיאה בהקטנת התמונה");
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } finally {
    bitmap.close?.();
  }
}

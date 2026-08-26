/** Client-side downsize + re-encode to JPEG before upload — a straight-off-
 * the-camera file can be 20-40MB, but a gallery only needs to look good on
 * screen. Cuts storage (and the free-tier quota it eats into) by roughly
 * 80-90% per photo without a visible quality drop. Skips files that are
 * already small, and if the browser can't decode the file at all (some
 * HEIC exports) or compression somehow doesn't actually shrink it, falls
 * back to uploading the original untouched rather than blocking the admin.
 *
 * Shared by every admin photo-upload flow (page-image galleries, photo
 * clients' proof/edited uploads) so they all get the same treatment — see
 * where else this is imported for the full list.
 */
export async function compressImage(file: File, maxDim = 2400, quality = 0.85): Promise<File> {
  if (file.size < 400 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

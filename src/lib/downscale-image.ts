// Shrinks a user-picked photo to a reasonable upload size before it's sent
// over the wire as a base64 JSON payload (server functions here don't use
// multipart uploads) — keeps request bodies small and bounds AI model cost.
export async function fileToCompressedDataUrl(
  file: File,
  maxDim = 1536,
  quality = 0.85,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("לא ניתן לעבד את התמונה בדפדפן הזה.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    return { dataUrl: canvas.toDataURL("image/jpeg", quality), width, height };
  } finally {
    bitmap.close();
  }
}

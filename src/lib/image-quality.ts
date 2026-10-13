// Client-side, zero-dependency photo triage heuristics — the free "סינון
// חכם ראשוני" (smart initial filter) tier, run entirely in the browser on
// canvas pixel data, no AI call and no cost. Two signals, combined per
// explicit request: blur (sharpness) and near-duplicate detection.
//
// Blur: the standard "variance of Laplacian" sharpness metric (well-known
// OpenCV technique, not guessed) — a 3x3 edge-detection kernel highlights
// contrast/edges; a sharp photo has lots of high-contrast edges (high
// variance), a blurry one looks smooth everywhere (low variance).
//
// Near-duplicate: an average hash (aHash) — shrink to 8x8 grayscale,
// 1-bit-per-pixel vs the mean brightness, compare hashes by Hamming
// distance. Two photos of basically the same shot land very close in
// Hamming distance even with minor framing/exposure differences; a small
// threshold (≤5 of 64 bits) is the commonly-cited default for "likely the
// same shot" with this hash size.

async function loadBitmap(file: File | Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function drawToCanvas(bitmap: ImageBitmap, size: number): { ctx: CanvasRenderingContext2D; width: number; height: number } {
  const scale = size / Math.max(bitmap.width, bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { ctx, width, height };
}

/** Higher = sharper. Typical real-world range is roughly 0 (flat/blurry) to a few hundred+ (crisp detail) at this downscale — there's no universal fixed cutoff, so callers should compare photos within the same batch (e.g. flag the bottom ~20%) rather than against a hardcoded absolute number. */
export async function computeBlurScore(file: File | Blob): Promise<number> {
  const bitmap = await loadBitmap(file);
  const { ctx, width, height } = drawToCanvas(bitmap, 300);
  bitmap.close?.();
  const { data } = ctx.getImageData(0, 0, width, height);

  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // 3x3 Laplacian kernel: [[0,1,0],[1,-4,1],[0,1,0]] — skip the 1px border.
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap = gray[idx - width] + gray[idx + width] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean; // variance
}

/** 64-bit average hash, returned as a 16-char hex string. */
export async function computeAverageHash(file: File | Blob): Promise<string> {
  const bitmap = await loadBitmap(file);
  const { ctx } = drawToCanvas(bitmap, 8);
  bitmap.close?.();
  const { data } = ctx.getImageData(0, 0, 8, 8);

  const gray: number[] = [];
  for (let i = 0; i < 64; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    gray.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  const mean = gray.reduce((a, b) => a + b, 0) / gray.length;

  let hex = "";
  for (let nibble = 0; nibble < 16; nibble++) {
    let val = 0;
    for (let bit = 0; bit < 4; bit++) {
      val = (val << 1) | (gray[nibble * 4 + bit] > mean ? 1 : 0);
    }
    hex += val.toString(16);
  }
  return hex;
}

export function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

const NEAR_DUPLICATE_THRESHOLD = 5; // out of 64 bits — standard aHash default for "likely same shot"
const BLUR_FLAG_PERCENTILE = 0.2; // flag the bottom ~20% of the batch by sharpness

export type TriageFlag = { imageId: string; blurry: boolean; nearDuplicateOf: string | null; blurScore: number };

/**
 * Runs both heuristics over a batch of already-downloaded images and
 * returns a flag per image — never deletes anything itself, just surfaces
 * candidates for the admin to confirm/reject in PhotoTriagePanel.
 * `items` must already have their blobs fetched (the caller downloads each
 * image_url first) since this never touches the network itself.
 */
export async function runSmartTriage(items: { id: string; blob: Blob }[]): Promise<TriageFlag[]> {
  const blurScores = await Promise.all(items.map((it) => computeBlurScore(it.blob)));
  const hashes = await Promise.all(items.map((it) => computeAverageHash(it.blob)));

  const sorted = [...blurScores].sort((a, b) => a - b);
  const cutoffIndex = Math.floor(sorted.length * BLUR_FLAG_PERCENTILE);
  const blurCutoff = sorted[cutoffIndex] ?? 0;

  const nearDuplicateOf: (string | null)[] = items.map(() => null);
  for (let i = 0; i < items.length; i++) {
    if (nearDuplicateOf[i]) continue;
    for (let j = i + 1; j < items.length; j++) {
      if (nearDuplicateOf[j]) continue;
      if (hammingDistanceHex(hashes[i], hashes[j]) <= NEAR_DUPLICATE_THRESHOLD) {
        nearDuplicateOf[j] = items[i].id; // keep the first of the pair, flag the later one
      }
    }
  }

  return items.map((it, i) => ({
    imageId: it.id,
    blurry: blurScores[i] <= blurCutoff,
    nearDuplicateOf: nearDuplicateOf[i],
    blurScore: blurScores[i],
  }));
}

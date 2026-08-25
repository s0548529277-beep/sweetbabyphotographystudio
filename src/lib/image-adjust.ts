// Client-side (Canvas-based) parametric photo adjustments — a lightweight
// "Camera Raw"-style panel: brightness/contrast/saturation/temperature/
// vignette, computed per-pixel and applied deterministically. No AI model
// involved on purpose — this is meant for fast, predictable, free bulk
// processing of many photos at once, unlike the generative style editor.

export type AdjustSettings = {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100 ("חיזוק צבע")
  temperature: number; // -100 (cool) .. 100 (warm) ("טון צבע")
  vignette: number; // 0..100 — darkens the edges/background
};

export const DEFAULT_ADJUST: AdjustSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  vignette: 0,
};

// Fixed (non-AI) style presets — deterministic Camera-Raw-style parameter
// sets that approximate the mood of a few of the AI photo-editor's style
// presets (see PHOTO_EDIT_STYLES in photo-editor.functions.ts), for the
// free/instant bulk tool when a full model-based edit isn't needed. A
// preset is just a starting point for the sliders above — picking one
// fills in the numbers, then they're still hand-tunable per photo/batch.
// Starts with only "warm forest" (יער); more presets are added and the
// numbers below get tuned as reference before/after examples come in.
export type AdjustPreset = { label: string; settings: AdjustSettings };

export const ADJUST_PRESETS: Record<string, AdjustPreset> = {
  warm_forest: {
    label: "יער חם",
    settings: { brightness: 6, contrast: 12, saturation: 8, temperature: 38, vignette: 22 },
  },
};

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/** Renders `file` through the given adjustments onto `canvas` (sized to the image) — used for the live single-image preview. */
export async function drawAdjustedToCanvas(file: File | Blob, settings: AdjustSettings, canvas: HTMLCanvasElement): Promise<void> {
  const img = await loadImage(file);
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(img, 0, 0);
  applyPixelAdjustments(ctx, canvas.width, canvas.height, settings);
}

/** Same processing, returned as a downloadable JPEG blob — used for the batch export. */
export async function applyAdjustments(file: File | Blob, settings: AdjustSettings): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0);
  applyPixelAdjustments(ctx, canvas.width, canvas.height, settings);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("יצירת קובץ נכשלה"))), "image/jpeg", 0.92);
  });
}

function applyPixelAdjustments(ctx: CanvasRenderingContext2D, width: number, height: number, settings: AdjustSettings): void {
  const { brightness, contrast, saturation, temperature } = settings;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const brightnessOffset = brightness * 1.5; // -150..150
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const satFactor = 1 + saturation / 100;
  const warmR = temperature > 0 ? temperature * 0.6 : 0;
  const warmBDown = temperature > 0 ? temperature * 0.3 : 0;
  const coolB = temperature < 0 ? -temperature * 0.6 : 0;
  const coolRDown = temperature < 0 ? -temperature * 0.3 : 0;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r += brightnessOffset;
    g += brightnessOffset;
    b += brightnessOffset;

    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * satFactor;
    g = gray + (g - gray) * satFactor;
    b = gray + (b - gray) * satFactor;

    r += warmR - coolRDown;
    b += coolB - warmBDown;

    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
  }

  ctx.putImageData(imageData, 0, 0);

  if (settings.vignette > 0) {
    const cx = width / 2;
    const cy = height / 2;
    const inner = Math.min(width, height) * 0.3;
    const outer = Math.max(width, height) * 0.75;
    const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${settings.vignette / 100})`);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
  }
}

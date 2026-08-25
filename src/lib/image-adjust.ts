// Client-side (Canvas-based) parametric photo adjustments — a lightweight
// "Camera Raw"-style panel computed per-pixel and applied deterministically.
// No AI model involved on purpose — this is meant for fast, predictable,
// free bulk processing of many photos at once, unlike the generative style
// editor. Beyond flat brightness/contrast/saturation/temperature, it does
// two things real editing tools do and a single global filter can't:
//   - tone-zone control (highlights/shadows), so brightening a backlit
//     photo doesn't just wash out the sky along with the subject
//   - split toning (a different color cast for shadows vs. highlights),
//     which is what actually produces a "graded" look (teal-shadow/
//     orange-highlight, warm-backlight-glow, faded-film, etc.) instead of
//     a uniform color-cast filter over the whole frame
//   - a sun-flare glow overlay (blended with "screen", not drawn opaque),
//     for the backlit-sun look a flat color/tone adjustment can't fake
export type AdjustSettings = {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100 ("חיזוק צבע")
  temperature: number; // -100 (cool) .. 100 (warm) ("טון צבע") — overall white balance
  highlights: number; // -100..100 — recovers (negative) or boosts (positive) the bright zone only
  shadows: number; // -100..100 — crushes (negative) or lifts (positive) the dark zone only
  splitTone: number; // -100..100 — cinematic split toning: negative = cool shadows/warm highlights, positive = warm shadows/cool highlights
  vignette: number; // 0..100 — darkens the edges/background
  sunFlare: number; // 0..100 — warm glow overlay from the upper-right corner, simulating backlit sun
};

export const DEFAULT_ADJUST: AdjustSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  highlights: 0,
  shadows: 0,
  splitTone: 0,
  vignette: 0,
  sunFlare: 0,
};

// Fixed (non-AI) style presets — deterministic Camera-Raw-style parameter
// sets that approximate the mood of the AI photo-editor's style presets
// (see PHOTO_EDIT_STYLES in photo-editor.functions.ts), for the
// free/instant bulk tool when a full model-based edit isn't needed. A
// preset is just a starting point for the sliders above — picking one
// fills in the numbers, then they're still hand-tunable per photo/batch.
// Keyed the same as PHOTO_EDIT_STYLES so the two tools share vocabulary.
// None of these are calibrated against real before/after references yet —
// they're first-guess numbers read off each style's text description, to
// be tuned for real once reference examples come in per style.
//
// Three PHOTO_EDIT_STYLES entries are deliberately skipped here: "custom"
// (free-text, nothing to encode), "studio_clean" (removes equipment from
// the frame — content-aware, not a pixel color/tone adjustment) and
// "beauty_retouch" (face-only skin smoothing — needs face-aware
// processing, not a whole-image adjustment).
export type AdjustPreset = { label: string; settings: AdjustSettings };

export const ADJUST_PRESETS: Record<string, AdjustPreset> = {
  newborn: {
    label: "ניו-בורן — רך וחמים",
    settings: { brightness: 8, contrast: -8, saturation: -10, temperature: 18, highlights: -8, shadows: 15, splitTone: 10, vignette: 8, sunFlare: 0 },
  },
  warm_forest: {
    label: "יער חם",
    settings: { brightness: 6, contrast: 12, saturation: 8, temperature: 38, highlights: 14, shadows: 6, splitTone: 0, vignette: 22, sunFlare: 35 },
  },
  river: {
    label: "נחל — גוונים טבעיים ורעננים",
    settings: { brightness: 4, contrast: 6, saturation: 12, temperature: -8, highlights: 6, shadows: 6, splitTone: -10, vignette: 10, sunFlare: 15 },
  },
  outdoor_general: {
    label: "חוץ כללי — טבעי ומאוזן",
    settings: { brightness: 3, contrast: 8, saturation: 5, temperature: 5, highlights: 4, shadows: 4, splitTone: 0, vignette: 5, sunFlare: 10 },
  },
  studio_bright: {
    label: "סטודיו בהיר — נקי וקלאסי",
    settings: { brightness: 12, contrast: -5, saturation: -5, temperature: -10, highlights: -10, shadows: 10, splitTone: 0, vignette: 0, sunFlare: 0 },
  },
  beach: {
    label: "ים וחוף — קיצי ובהיר",
    settings: { brightness: 10, contrast: -5, saturation: 15, temperature: 20, highlights: 8, shadows: 8, splitTone: -10, vignette: 5, sunFlare: 30 },
  },
  bright_airy: {
    label: "בהיר ואוורירי — לייף-סטייל מודרני",
    settings: { brightness: 15, contrast: -12, saturation: -8, temperature: 5, highlights: -12, shadows: 18, splitTone: 0, vignette: 0, sunFlare: 15 },
  },
  film_vintage: {
    label: "פילם קלאסי — נוסטלגי",
    settings: { brightness: 5, contrast: -15, saturation: -12, temperature: 15, highlights: -10, shadows: 20, splitTone: 20, vignette: 15, sunFlare: 20 },
  },
  moody_dark: {
    label: "דרמטי וכהה — עריכתי",
    settings: { brightness: -10, contrast: 25, saturation: -5, temperature: -15, highlights: -15, shadows: -10, splitTone: -20, vignette: 35, sunFlare: 0 },
  },
};

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** amount>0 = warm (r up, b down), amount<0 = cool (r down, b up) — same 0.6/0.3 split used for both the overall white-balance shift and each split-tone zone below. */
function warmthDelta(amount: number): [dr: number, db: number] {
  if (amount === 0) return [0, 0];
  return amount > 0 ? [amount * 0.6, -amount * 0.3] : [amount * 0.3, -amount * 0.6];
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
  const { brightness, contrast, saturation, temperature, highlights, shadows, splitTone } = settings;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const brightnessOffset = brightness * 1.5; // -150..150
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const satFactor = 1 + saturation / 100;
  const shadowsAmt = shadows * 0.7; // -70..70, applied only in the dark zone
  const highlightsAmt = highlights * 0.7; // -70..70, applied only in the bright zone
  const [wbDr, wbDb] = warmthDelta(temperature);
  // Split toning: shifts warmth in opposite directions per tone zone instead
  // of uniformly — splitTone>0 warms shadows/cools highlights (faded-film),
  // splitTone<0 cools shadows/warms highlights (cinematic backlit glow).
  const [shadowDr, shadowDb] = warmthDelta(splitTone);
  const [highlightDr, highlightDb] = warmthDelta(-splitTone);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Tone-zone masks from the pixel's original luminance, before any
    // adjustment moves it — so "shadows"/"highlights" mean the photo's
    // actual dark/bright areas, not a moving target.
    const lum = 0.299 * r + 0.587 * g + 0.114 * b; // 0..255
    const shadowMask = Math.max(0, 1 - lum / 128); // 1 at black -> 0 at mid-gray
    const highlightMask = Math.max(0, (lum - 128) / 127); // 0 at mid-gray -> 1 at white

    r += brightnessOffset;
    g += brightnessOffset;
    b += brightnessOffset;

    const zoneOffset = shadowsAmt * shadowMask + highlightsAmt * highlightMask;
    r += zoneOffset;
    g += zoneOffset;
    b += zoneOffset;

    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * satFactor;
    g = gray + (g - gray) * satFactor;
    b = gray + (b - gray) * satFactor;

    r += wbDr + shadowDr * shadowMask + highlightDr * highlightMask;
    b += wbDb + shadowDb * shadowMask + highlightDb * highlightMask;

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

  if (settings.sunFlare > 0) {
    // A warm glow blended with "screen" (adds light, same as a real lens
    // catching backlight) rather than drawn as an opaque overlay — so it
    // brightens what's already there instead of flattening it under a
    // solid color the way a plain semi-transparent fill would.
    const flareX = width * 0.85;
    const flareY = height * 0.15;
    const radius = Math.max(width, height) * 0.65;
    const grad = ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, radius);
    const alpha = (settings.sunFlare / 100) * 0.6;
    grad.addColorStop(0, `rgba(255, 235, 190, ${alpha})`);
    grad.addColorStop(0.25, `rgba(255, 215, 150, ${alpha * 0.55})`);
    grad.addColorStop(1, "rgba(255, 215, 150, 0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
  }
}

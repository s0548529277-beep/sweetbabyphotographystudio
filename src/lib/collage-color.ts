/**
 * Small color-math helpers for the collage maker's palette tools (manual
 * presets, the eyedropper, and photo-based auto color-match). Plain
 * hex/HSL math only — no DOM/canvas here; dominant-color extraction from an
 * actual uploaded photo needs a canvas and stays in collage-maker.tsx next
 * to the other browser-only rasterization code.
 */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return "#" + [clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Lighten a hex color by shifting its HSL lightness toward white by `amount` (0-1). */
export function lightenColor(hex: string, amount: number): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const nl = Math.min(1, l + (1 - l) * amount);
  return rgbToHex(...hslToRgb(h, s, nl));
}

/** Darken a hex color by shifting its HSL lightness toward black by `amount` (0-1). */
export function darkenColor(hex: string, amount: number): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const nl = Math.max(0, l * (1 - amount));
  return rgbToHex(...hslToRgb(h, s, nl));
}

/**
 * Given one sampled/dominant accent color (from the eyedropper or the
 * auto photo-match), derive a full coherent trio — a soft light
 * background and a darker readable caption color — so a single sampled
 * color always produces a usable palette, not just one swapped accent.
 */
export function paletteFromAccent(accentHex: string): { bg: string; accent: string; captionColor: string } {
  return {
    bg: lightenColor(accentHex, 0.92),
    accent: accentHex,
    captionColor: darkenColor(accentHex, 0.55),
  };
}

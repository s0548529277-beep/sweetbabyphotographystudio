const SITE_ORIGIN = "https://sweetbabyphotographystudio.lovable.app";

export function normalizeImageUrl(value?: string | null) {
  const src = value?.trim();
  if (!src) return null;
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  return src.startsWith("/") ? src : `/${src}`;
}

export function absoluteImageUrl(value?: string | null) {
  const src = normalizeImageUrl(value);
  if (!src) return undefined;
  if (/^https?:/i.test(src)) return src;
  if (/^(data:|blob:)/i.test(src)) return undefined;
  return `${SITE_ORIGIN}${src}`;
}
// Client-gallery photos are stored in Lovable Cloud storage, whose host
// (*.lovable.cloud) is blocked by NetFree / Netiv / Etrog — so religious
// clients behind those filters saw an empty gallery. Per owner request,
// gallery photos are served through the site's own domain instead
// (/media/... → src/routes/media.$.ts proxies to storage), so only
// sweetbabyphoto.shop has to be whitelisted with the filters.
//
// Pure string rewrite, safe on server and client. Anything that is not a
// storage object URL (already-relative paths, Drive links, data: URLs) is
// returned unchanged.

const STORAGE_OBJECT_RE = /^https?:\/\/([^/]+)\/storage\/v1\/object\/(public|sign)\/(.+)$/i;

function isStorageHost(host: string): boolean {
  const h = host.toLowerCase();
  return h.endsWith(".lovable.cloud") || h.endsWith(".supabase.co");
}

export function toSiteMediaUrl<T extends string | null | undefined>(url: T): T {
  if (!url) return url;
  const m = STORAGE_OBJECT_RE.exec(url);
  if (!m || !isStorageHost(m[1])) return url;
  return `/media/${m[2].toLowerCase()}/${m[3]}` as T;
}

const SITE_ORIGIN = "https://sweetbabyphoto.shop";

/**
 * Small, fast thumbnail URL for emails (catalog item photos shown at ~40px).
 * Storage public photos become `https://sweetbabyphoto.shop/media/public/...?w=<px>`;
 * the /media proxy resizes them (and falls back to the original if resizing
 * is unavailable). Anything else is returned unchanged. Always absolute,
 * since mail clients can't resolve relative paths.
 */
export function emailThumbUrl<T extends string | null | undefined>(url: T, px = 80): T {
  if (!url) return url;
  const m = STORAGE_OBJECT_RE.exec(url);
  if (!m || !isStorageHost(m[1]) || m[2].toLowerCase() !== "public") return url;
  const path = m[3].split("?")[0];
  return `${SITE_ORIGIN}/media/public/${path}?w=${px}` as T;
}

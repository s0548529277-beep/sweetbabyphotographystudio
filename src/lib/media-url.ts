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

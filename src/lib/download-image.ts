/**
 * Forces a real download of an image shown in a lightbox, at whatever
 * quality/resolution is already being served on the page — no separate
 * "original" file is fetched or stored anywhere in this app, so this is
 * the same bytes the visitor is already looking at.
 *
 * A plain `<a href download>` silently fails to force-download for
 * cross-origin images (Supabase Storage signed URLs, the bundled WordPress
 * stock photos) — browsers just navigate/open them instead, since the
 * `download` attribute only reliably applies to same-origin resources.
 * Fetching the bytes ourselves and downloading from a blob: URL works
 * regardless of origin.
 */
export async function downloadImage(url: string, filename = "photo.jpg"): Promise<void> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    // CORS or network hiccup — fall back to opening the image directly so
    // the visitor can still save it manually (right-click → save) rather
    // than the click doing nothing at all.
    window.open(url, "_blank", "noopener");
  }
}

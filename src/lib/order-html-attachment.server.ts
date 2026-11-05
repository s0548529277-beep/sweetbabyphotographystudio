// Builds a self-contained copy of an order e-mail (images embedded as data:
// URIs) so it can be attached as a file. Mail clients and content filters
// (NetFree etc.) often block remote images inside the mail body; an attached
// file opens offline with every photo in place.

const IMG_SRC_RE = /(<img\b[^>]*?\bsrc=")(https:\/\/sweetbabyphoto\.shop\/[^"]+)(")/gi;

function toBase64(buf: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 400_000) return null; // keep the attachment light
    return `data:${type};base64,${toBase64(buf)}`;
  } catch {
    return null;
  }
}

/** Returns a Gmail attachment holding the e-mail HTML with images inlined (best-effort; null on failure). */
export async function buildOrderHtmlAttachment(
  html: string,
  orderId: string,
): Promise<{ filename: string; contentType: string; base64Data: string } | null> {
  try {
    const urls = Array.from(new Set(Array.from(html.matchAll(IMG_SRC_RE), (m) => m[2])));
    const cache = new Map<string, string | null>();
    await Promise.all(urls.map(async (u) => cache.set(u, await fetchAsDataUri(u.replace(/&amp;/g, "&")))));
    const inlined = html.replace(IMG_SRC_RE, (full, a, url, c) => {
      const data = cache.get(url);
      return data ? `${a}${data}${c}` : full;
    });
    const doc = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>אישור הזמנה</title></head><body style="margin:0">${inlined}</body></html>`;
    const bytes = new TextEncoder().encode(doc);
    return {
      filename: `order-${orderId.slice(0, 8)}.html`,
      contentType: "text/html; charset=UTF-8",
      base64Data: toBase64(bytes),
    };
  } catch (e) {
    console.error("[SWEETBABY] order html attachment failed", e);
    return null;
  }
}

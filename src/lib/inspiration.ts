// Filename-based inspiration image lookup.
// Drop files into /src/inspiration/ named like:
//   sku-123.jpg           → linked to prop with SKU "123"
//   sku-123-2.jpg         → additional image for SKU 123
//   studio-1.jpg          → studio inspiration (Track: studio-rental)
// Supported: .jpg .jpeg .png .webp .avif

const modules = import.meta.glob(
  "/src/inspiration/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP,AVIF}",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

const bySku: Record<string, string[]> = {};
const studio: string[] = [];

for (const [path, url] of Object.entries(modules)) {
  const name = path.split("/").pop()!.toLowerCase();
  const base = name.replace(/\.(jpg|jpeg|png|webp|avif)$/i, "");
  const skuMatch = base.match(/^sku-([a-z0-9]+)(?:-\d+)?$/i);
  const studioMatch = base.match(/^studio-\d+$/i);
  if (skuMatch) {
    const sku = skuMatch[1];
    (bySku[sku] ||= []).push(url);
  } else if (studioMatch) {
    studio.push(url);
  }
}

// Sort so `sku-123.jpg` comes before `sku-123-2.jpg`, and studio-1 before studio-2.
for (const key of Object.keys(bySku)) bySku[key].sort();
studio.sort();

export function inspirationFor(sku: string | number | null | undefined): string[] {
  if (sku == null) return [];
  return bySku[String(sku)] ?? [];
}

export function studioInspiration(): string[] {
  return studio;
}

/** Studio inspiration images keyed by their stable source path (URLs change per build). */
export function studioInspirationMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(modules)) {
    const name = path.split("/").pop()!.toLowerCase();
    if (/^studio-\d+\.(jpg|jpeg|png|webp|avif)$/i.test(name)) out[path] = url;
  }
  return out;
}

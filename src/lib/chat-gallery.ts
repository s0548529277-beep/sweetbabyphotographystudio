type PublicGalleryRow = { url: string; caption: string | null; source: string; hidden: boolean };

/** Only published portfolio rows may leave the gallery tool, including in admin chat. */
export function publicChatPhotos(rows: PublicGalleryRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (row.hidden || row.source === "config" || !row.url || seen.has(row.url)) return false;
    seen.add(row.url);
    return true;
  }).slice(0, 4).map((row) => ({ url: row.url, caption: row.caption || "" }));
}
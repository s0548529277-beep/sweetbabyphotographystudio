// Pure matching for "already closed" customers (visitor alerts skip them).
export function last9(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
}
export function lowerEmail(raw: string | null | undefined): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}
export type ContactRow = { contact_phone?: string | null; contact_email?: string | null };
export function rowMatches(row: ContactRow, phone: string | null, email: string | null): boolean {
  const p = last9(phone), e = lowerEmail(email);
  if (p && last9(row.contact_phone) === p) return true;
  if (e && lowerEmail(row.contact_email) === e) return true;
  return false;
}
export function parseIgnoreList(value: unknown): { phones: Set<string>; emails: Set<string> } {
  const out = { phones: new Set<string>(), emails: new Set<string>() };
  try {
    const v = typeof value === "string" ? JSON.parse(value) : value;
    if (!v || typeof v !== "object") return out;
    for (const p of (v as any).phones ?? []) { const k = last9(String(p)); if (k) out.phones.add(k); else out.phones.add(String(p).replace(/\D/g, "")); }
    for (const m of (v as any).emails ?? []) { const k = lowerEmail(String(m)); if (k) out.emails.add(k); }
  } catch { /* broken JSON = ignore */ }
  return out;
}
export function inIgnoreList(list: { phones: Set<string>; emails: Set<string> }, phone: string | null, email: string | null): boolean {
  const d = String(phone ?? "").replace(/\D/g, "");
  const p = last9(phone);
  const e = lowerEmail(email);
  if (p && list.phones.has(p)) return true;
  if (d && [...list.phones].some((x) => x.length >= 8 && d.endsWith(x))) return true;
  return !!(e && list.emails.has(e));
}

// Editable e-mail design (owner request 2026-11-08: "manage it from the site — choose photos, colours and more").
// Stored as JSON in app_settings.email_design. The mail builders (email-draft-design.ts) always write the DEFAULT
// colours; just before a mail is sent / saved as a Gmail draft, applyEmailDesignToHtml swaps them for the saved ones,
// so every mail that carries the shell marker (data-mail="studio" | "photographer") follows the settings.

export const EMAIL_DESIGN_KEY = "email_design";

export type MailFrame = "thick" | "thin";
export type BrandDesign = { from: string; mid: string; to: string; accent: string; frame: MailFrame };
export type EmailDesign = {
  studio: BrandDesign;
  photographer: BrandDesign;
  /** Photos for the arched cards of the photographer price lists (empty = the sample photos of the draft assistant). */
  cardPhotos: { newborn: string[]; outdoor: string[] };
};

export const DEFAULT_EMAIL_DESIGN: EmailDesign = {
  studio: { from: "#dfe8d3", mid: "#f3d9d2", to: "#e9d3b9", accent: "#2d3d2b", frame: "thick" },
  photographer: { from: "#f6d8d0", mid: "#eccbb4", to: "#d9b898", accent: "#c23b6d", frame: "thin" },
  cardPhotos: { newborn: [], outdoor: [] },
};

export const FRAME_PADDING: Record<MailFrame, string> = { thick: "26px 16px", thin: "12px 8px" };

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : d);
const urls = (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .filter((u): u is string => typeof u === "string" && /^https:\/\/\S{4,500}$/.test(u.trim()))
    .map((u) => u.trim())
    .slice(0, 3);

function brand(raw: any, d: BrandDesign): BrandDesign {
  return {
    from: hex(raw?.from, d.from),
    mid: hex(raw?.mid, d.mid),
    to: hex(raw?.to, d.to),
    accent: hex(raw?.accent, d.accent),
    frame: raw?.frame === "thick" || raw?.frame === "thin" ? raw.frame : d.frame,
  };
}

/** Always returns a complete, safe design (unknown / malformed input falls back to the defaults). */
export function sanitizeEmailDesign(raw: unknown): EmailDesign {
  const r: any = raw && typeof raw === "object" ? raw : {};
  return {
    studio: brand(r.studio, DEFAULT_EMAIL_DESIGN.studio),
    photographer: brand(r.photographer, DEFAULT_EMAIL_DESIGN.photographer),
    cardPhotos: { newborn: urls(r.cardPhotos?.newborn), outdoor: urls(r.cardPhotos?.outdoor) },
  };
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Swap the default colours / frame of the shell for the saved design. Mails without the shell marker are returned untouched. */
export function applyEmailDesignToHtml(html: string, design: EmailDesign): string {
  const m = /data-mail="(studio|photographer)"/.exec(html);
  if (!m) return html;
  const which = m[1] as "studio" | "photographer";
  const d = DEFAULT_EMAIL_DESIGN[which];
  const v = design[which];
  // One pass over the four default colours, so a new colour that equals another default is never swapped twice.
  const map = new Map<string, string>();
  (["from", "mid", "to", "accent"] as const).forEach((k) => map.set(d[k].toLowerCase(), v[k]));
  let out = html.replace(/#[0-9a-fA-F]{6}\b/g, (c) => map.get(c.toLowerCase()) ?? c);
  // Frame thickness: the outer wrapper's padding (first padding after the marker).
  out = out.replace(/(data-mail="(?:studio|photographer)"[^>]*?padding:)[^;"]+(;)/, `$1${FRAME_PADDING[v.frame]}$2`);
  return out;
}

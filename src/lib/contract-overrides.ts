/**
 * Permanent edits of the fixed contract wording for צילומי חוץ and צילום כללי
 * (owner request 2026-11-14, same idea as the newborn template page).
 * Stored per kind in app_settings as JSON { "<section title>": "<plain text>" };
 * paragraphs are separated by a new line. Only sections the owner changed are
 * stored, the rest keep following the shipped text. Sections that carry
 * per-client details (date, package, price, deposit) cannot be overridden.
 */
export type ContractKind = "outdoor" | "photo";
export type ContractOverrides = Record<string, string>;

export const CONTRACT_OVERRIDE_KEYS: Record<ContractKind, string> = {
  outdoor: "outdoor_contract_overrides",
  photo: "photo_contract_overrides",
};

/** Sections filled with client-specific details — never overridden. */
export const CONTRACT_LOCKED_TITLES: Record<ContractKind, string[]> = {
  outdoor: ["פרטי החבילה", "מועד ושעת הצילום", "מקדמה"],
  photo: ["פרטי החבילה", "מועד ושעת הצילום", "אופן התשלום"],
};

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function textToSectionHtml(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p style="margin:4px 0">${esc(l)}</p>`)
    .join("");
}

export function sectionHtmlToText(html: string): string {
  return html
    .replace(/<\/p>\s*/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

export function applyContractOverrides<T extends { title: string; html: string }>(
  kind: ContractKind,
  sections: T[],
  overrides?: ContractOverrides | null,
): T[] {
  if (!overrides) return sections;
  const locked = CONTRACT_LOCKED_TITLES[kind];
  return sections.map((s) => {
    const text = overrides[s.title];
    if (typeof text !== "string" || !text.trim() || locked.includes(s.title)) return s;
    return { ...s, html: textToSectionHtml(text) };
  });
}

export function parseContractOverrides(raw: unknown): ContractOverrides {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return {};
    const out: ContractOverrides = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v.slice(0, 4000);
    }
    return out;
  } catch {
    return {};
  }
}

/** Reads the saved overrides with any Supabase client that may read app_settings. */
export async function loadContractOverrides(db: any, kind: ContractKind): Promise<ContractOverrides> {
  try {
    const { data } = await db.from("app_settings").select("value").eq("key", CONTRACT_OVERRIDE_KEYS[kind]).maybeSingle();
    return parseContractOverrides((data as any)?.value);
  } catch {
    return {};
  }
}

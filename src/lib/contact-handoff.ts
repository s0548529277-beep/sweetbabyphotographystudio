/**
 * Carries the customer's contact details between the steps of the studio flow
 * (questionnaire → calendar → payment) so they only type them once.
 */
export type ContactHandoff = {
  fullName: string;
  phone: string;
  email: string;
  /** Session type chosen in the coordination agreement (e.g. "ניו-בורן"). */
  sessionType: string;
  /** Guidance add-on key: basic | mini | plus | premium. */
  guidance: string;
};

const KEY = "sb_contact_handoff";

const EMPTY: ContactHandoff = { fullName: "", phone: "", email: "", sessionType: "", guidance: "" };

export function saveContactHandoff(c: Partial<ContactHandoff>) {
  if (typeof window === "undefined") return;
  try {
    const prev = loadContactHandoff();
    const next: ContactHandoff = {
      fullName: c.fullName || prev.fullName,
      phone: c.phone || prev.phone,
      email: c.email || prev.email,
      sessionType: c.sessionType || prev.sessionType,
      guidance: c.guidance || prev.guidance,
    };
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* storage unavailable */ }
}

export function loadContactHandoff(): ContactHandoff {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const p = JSON.parse(raw) as Partial<ContactHandoff>;
    return {
      fullName: p.fullName || "",
      phone: p.phone || "",
      email: p.email || "",
      sessionType: p.sessionType || "",
      guidance: p.guidance || "",
    };
  } catch {
    return { ...EMPTY };
  }
}

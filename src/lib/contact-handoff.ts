/**
 * Carries the customer's contact details between the steps of the studio flow
 * (questionnaire → calendar → payment) so they only type them once.
 */
export type ContactHandoff = { fullName: string; phone: string; email: string };

const KEY = "sb_contact_handoff";

export function saveContactHandoff(c: Partial<ContactHandoff>) {
  if (typeof window === "undefined") return;
  try {
    const prev = loadContactHandoff();
    const next: ContactHandoff = {
      fullName: c.fullName || prev.fullName,
      phone: c.phone || prev.phone,
      email: c.email || prev.email,
    };
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* storage unavailable */ }
}

export function loadContactHandoff(): ContactHandoff {
  if (typeof window === "undefined") return { fullName: "", phone: "", email: "" };
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return { fullName: "", phone: "", email: "" };
    const p = JSON.parse(raw) as Partial<ContactHandoff>;
    return { fullName: p.fullName || "", phone: p.phone || "", email: p.email || "" };
  } catch {
    return { fullName: "", phone: "", email: "" };
  }
}

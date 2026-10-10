/**
 * Site-wide cookie/local-storage consent, per Israel's Protection of Privacy
 * Law Amendment 13 (בתוקף מ-14.8.2025): any site that stores data in the
 * visitor's browser for analytics/marketing purposes needs a consent
 * banner, and the choice has to be a real opt-in (not pre-checked).
 *
 * Stored in localStorage (not a cookie itself — simpler, same-origin only,
 * no server round-trip needed to read it). Consumers (SiteTracking,
 * Analytics) read/subscribe via this module instead of touching
 * localStorage directly, so the one place that defines "consented" stays
 * authoritative.
 */

export type ConsentChoice = "accepted" | "rejected";

const STORAGE_KEY = "sweetbaby-cookie-consent";
const CHANGE_EVENT = "sweetbaby-cookie-consent-change";

export function getCookieConsent(): ConsentChoice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

export function setCookieConsent(choice: ConsentChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // best-effort — the in-memory event below still lets this tab react
  }
  window.dispatchEvent(new CustomEvent<ConsentChoice>(CHANGE_EVENT, { detail: choice }));
}

/** Subscribes to consent changes made in this same tab (e.g. right after the banner is answered, with no reload). Returns an unsubscribe function. */
export function onCookieConsentChange(cb: (choice: ConsentChoice) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<ConsentChoice>).detail);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

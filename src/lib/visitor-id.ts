/**
 * Persistent per-browser visitor id, so the admin can see how many times the same person came back.
 * Stored in localStorage and ONLY while the visitor has accepted the cookie banner: without an explicit "accepted"
 * nothing is created, nothing is read and nothing is sent. Choosing "רק הכרחי" later deletes it.
 */
import { getCookieConsent } from "@/lib/cookie-consent";

const KEY = "sb_visitor_id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The existing id, or null when there is none or consent was not given. Never creates one. */
export function getVisitorId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    if (getCookieConsent() !== "accepted") return null;
    const v = window.localStorage.getItem(KEY);
    return v && UUID_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Reads the id or creates it. Only call after consent was confirmed (SiteTracking does). */
export function ensureVisitorId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    if (getCookieConsent() !== "accepted") return null;
    const existing = getVisitorId();
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return null;
  }
}

export function clearVisitorId() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

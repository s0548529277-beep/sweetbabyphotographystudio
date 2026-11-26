// One daily Gmail thread for the automatic lead notices (owner request 2026-11-25: "like the 'who to get back to' mail").
// Pure and dependency-free. The photographer-site repo holds the same rules (src/lib/lead-thread.ts) — keep both equal.

/** The real subject of a threaded notice travels in this header (URI-encoded), because the thread needs one subject. */
export const LEAD_SUBJECT_HEADER = "X-Site-Lead-Subject";
export const LEAD_THREAD_PREFIX = "🎯 לידים חדשים";
export const LEAD_THREAD_QUERY = 'newer_than:3d from:me subject:"לידים חדשים"';

/**
 * Only the notices the SITE produces by itself are threaded: quiz / funnel leads, "picked a package" and hot / returning
 * visitor alerts. A message a customer wrote and left (contact form, chat, phone message, birth basket) stays a
 * separate mail.
 */
export function isThreadedLeadSubject(subject: string): boolean {
  return /(?:ליד חם|חזרה לאתר)\s*:|ליד (?:חם|חדש)\s*(?:·|מהשאלון)|בחרה בחבילה/.test(subject || "");
}

export function leadThreadSubject(now: Date = new Date()): string {
  const day = now.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric" });
  return `${LEAD_THREAD_PREFIX} — ${day}`;
}

export function encodeLeadSubject(subject: string): string {
  return encodeURIComponent(Array.from(subject).slice(0, 110).join(""));
}

/** The subject every rule should judge: the original one of a threaded notice, else the mail's own subject. */
export function effectiveSubject(subject: string, leadHeader: string | null | undefined): string {
  if (!leadHeader) return subject;
  try {
    return decodeURIComponent(leadHeader.replace(/\s+/g, "")) || subject;
  } catch {
    return subject;
  }
}

/** A line with the original subject on top of the mail, so every message in the thread says who it is about. */
export function withLeadTitle(html: string, subject: string): string {
  const safe = subject.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const line = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;font-weight:700;text-align:right;margin:0 0 10px">${safe}</div>`;
  return /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (m) => m + line) : line + html;
}

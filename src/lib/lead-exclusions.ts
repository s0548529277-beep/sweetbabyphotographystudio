// Contacts that are the owner herself and her husband (they try the site's forms, quizzes and chat), never real leads
// (owner request 2026-11-26). Pure and dependency-free; used by the hourly digest, the lead mails, the draft assistant
// and the /admin/leads screen.

/** E-mail addresses of the owner and her husband (the studio's own mailboxes included). */
export const OWNER_TEST_EMAILS = new Set(["m0548529277@gmail.com", "s0548529277@gmail.com", "xv05832@gmail.com"]);
/** Last 9 digits of their phones: 054-852-9277, 053-418-1051 (business) and 058-327-0184. */
export const OWNER_TEST_PHONE_KEYS = new Set(["548529277", "534181051", "583270184"]);

const FIRST_NAMES = /(?:מיכל|נתנאל|michal|natanel|netanel)/i;
const FAMILY_NAMES = /(?:סיבוני|סיובני|אציבעוני|siboni|sibony|atzbaoni|tzivoni)/i;

const phoneKey = (p: unknown): string => {
  const d = String(p ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
};

/**
 * True when the contact is the owner or her husband:
 *  - their phone, or
 *  - their e-mail with no OTHER phone next to it (a lead that carries somebody else's phone is a real person whose e-mail
 *    field was filled wrongly — it stays), or
 *  - a name that holds one of their first names together with one of their family names.
 */
export function isOwnerTestContact(c: { name?: string | null; email?: string | null; phone?: string | null }): boolean {
  const pk = phoneKey(c.phone);
  if (pk && OWNER_TEST_PHONE_KEYS.has(pk)) return true;
  const email = String(c.email ?? "").trim().toLowerCase().replace(/\+[^@]*@/, "@");
  if (email && OWNER_TEST_EMAILS.has(email) && !pk) return true;
  const name = String(c.name ?? "");
  return FIRST_NAMES.test(name) && FAMILY_NAMES.test(name);
}

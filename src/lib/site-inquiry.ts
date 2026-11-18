// Pure helpers for the site-inquiry notices (kept apart from email-drafts.server.ts so they can be unit-tested).

/**
 * Inquiry notices the two sites mail from the studio address TO the studio address (funnel / quiz leads, site chat,
 * contact form, "photography with Michal" form, birth-basket interest, phone messages). They look like Michal's own
 * mail, so every other rule skips them — but when the customer left an e-mail in them, the assistant answers her with a
 * new draft, exactly like a legacy site-form mail. "ליד חם:" (visitor alert) deliberately does NOT match.
 */
export const SITE_INQUIRY_SUBJECT =
  /ליד (?:חם|חדש)\s*(?:·|מהשאלון)|בחרה בחבילה|פנייה מטופס יצירת הקשר|הודעה מצ['׳]אט האתר|הודעה מהצ['׳]אט באתר|פנייה · צילומים עם מיכל|מעוניינת במימוש סל לידה|הודעה מלקוחה בטלפון/;
export const SITE_INQUIRY_QUERY =
  'newer_than:3d from:me (subject:"ליד חדש" OR subject:"ליד חם" OR subject:"בחרה בחבילה" OR subject:"פנייה מטופס" OR subject:"הודעה מצ\'אט" OR subject:"הודעה מהצ׳אט" OR subject:"צילומים עם מיכל" OR subject:"מימוש סל לידה" OR subject:"הודעה מלקוחה")';
/** Addresses that are never the customer's: the studio / owner (old and new), the legacy form mailer and the sites themselves. */
const NOT_CUSTOMER_ADDRESS = /^(?:m0548529277|s0548529277)(?:\+[^@]*)?@gmail\.com$|@(?:sitemailerservice\.com|sweetbabyphoto\.shop|michalsiboni\.co\.il|lovable\.app)$/i;
/** The customer's e-mail inside a site notice: the first address that is not the studio's / owner's own. */
export function customerEmailInNotice(text: string): string | null {
  for (const m of text.matchAll(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g)) {
    const e = m[0].replace(/[.,;:]+$/, "");
    if (!NOT_CUSTOMER_ADDRESS.test(e)) return e.toLowerCase();
  }
  return null;
}


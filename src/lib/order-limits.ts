/**
 * Minimum total of a props-rental order (₪), one place for the site, the cart/checkout, the chat wizard and the
 * server check in `placeOrder`. Owner request 2026-11-15: raised from 50 to 100.
 * Text that is read by the bots / mails (ai.functions.ts, email-drafts.server.ts, voice-phrases.server.ts) is
 * written by hand with the same number — change those too if this value changes.
 */
export const MIN_PROPS_ORDER = 100;

/** Mail addressed to the studio side (the old s mailbox or the sweetbabyphoto.shop domain) — used by the admin mail-chat to tag a chat as "studio". */
export function isStudioChannelAddress(email: string | null | undefined): boolean {
  return !!email && /^s0548529277(?:\+[^@]*)?@gmail\.com$|@sweetbabyphoto\.shop$/i.test(email.trim());
}

/** The studio / owner's own mailboxes (the old s address and the current m address) — never a customer's address. */
export function isOwnStudioAddress(email: string | null | undefined): boolean {
  return !!email && /^(?:m0548529277|s0548529277)(?:\+[^@]*)?@gmail\.com$/i.test(email.trim());
}

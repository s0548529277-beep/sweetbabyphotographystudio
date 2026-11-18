/** The studio / owner's own mailboxes (the old s address and the current m address) — never a customer's address. */
export function isOwnStudioAddress(email: string | null | undefined): boolean {
  return !!email && /^(?:m0548529277|s0548529277)(?:\+[^@]*)?@gmail\.com$/i.test(email.trim());
}

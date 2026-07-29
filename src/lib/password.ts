/**
 * The studio wants customers to be able to use a short 4-digit code
 * (even "1234" or "0000") as their password. The auth service enforces a
 * minimum password length, so short codes are transparently expanded with a
 * fixed suffix before they are sent. Customers only ever see/type the code.
 */
const SUFFIX = ".Sb1";

export const MIN_PIN = 4;

export function toAuthPassword(input: string): string {
  const p = input.trim();
  return p.length >= 6 ? p : p + SUFFIX;
}

/** Candidates to try on sign-in: as typed first (legacy accounts), then expanded. */
export function authPasswordCandidates(input: string): string[] {
  const p = input.trim();
  const expanded = toAuthPassword(p);
  return expanded === p ? [p] : [p, expanded];
}

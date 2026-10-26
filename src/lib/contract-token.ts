/** Unguessable token for a client's contract signing link (/contract/$kind/$token). */
export function newContractToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

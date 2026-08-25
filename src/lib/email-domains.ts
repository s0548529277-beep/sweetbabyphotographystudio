// Common email domains offered as autocomplete suggestions once a customer
// types "@" in any email field on the site — so "michal@" immediately shows
// "michal@gmail.com" etc. as choices instead of requiring the whole domain
// to be typed by hand.
export const EMAIL_DOMAINS = [
  "gmail.com",
  "walla.co.il",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
];

export function emailDomainSuggestions(value: string): string[] {
  const at = value.indexOf("@");
  if (at === -1) return [];
  const local = value.slice(0, at);
  if (!local) return [];
  const typedDomain = value.slice(at + 1).toLowerCase();
  return EMAIL_DOMAINS.filter((d) => d.startsWith(typedDomain)).map((d) => `${local}@${d}`);
}

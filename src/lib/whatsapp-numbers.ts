// Plain constants (no `.server` suffix, like voice-bot-options.ts) so both
// the admin WhatsApp screen (client) and the webhook/admin server functions
// can import the same business-number labels without pulling server-only
// code into the client bundle.
//
// Only "netanel" is an actually-connected WhatsApp number right now — the
// other two are reserved labels for numbers the studio owner plans to
// connect later (studio line, Michal's own photographer line). Receiving
// already tags every incoming message/status with whichever number Meta
// says it was sent to (value.metadata.display_phone_number in the webhook
// payload — see api.public.whatsapp.webhook.ts), so the label shows up
// automatically the moment a second/third connection goes live, with no
// further code change needed on the receiving side. Sending FROM a specific
// number still needs that number's own connector credentials, which aren't
// wired up yet — see DEFAULT_BUSINESS_PHONE's comment below.
export type BusinessNumberId = "netanel" | "studio" | "michal";

export const BUSINESS_NUMBERS: { id: BusinessNumberId; label: string; digits: string }[] = [
  { id: "netanel", label: "קו קיים (נתנאל)", digits: "972583270184" },
  { id: "studio", label: "סטודיו", digits: "972548529277" },
  { id: "michal", label: "צלמת מיכל", digits: "972534181051" },
];

// The only number with a real, working WhatsApp connector today — used to
// tag outgoing admin-sent messages (admin-whatsapp.functions.ts) until a
// second connection exists and a "send from" picker is built.
export const DEFAULT_BUSINESS_PHONE = BUSINESS_NUMBERS[0].digits;

function lastDigits(s: string, n = 9): string {
  return s.replace(/\D/g, "").slice(-n);
}

/** Matches a phone string (any formatting — "+972 54-852-9277", "972548529277", …) to one of BUSINESS_NUMBERS by its last 9 digits (the local number without country code), so formatting differences from Meta's payload don't break the match. */
export function labelForBusinessPhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  const target = lastDigits(phone);
  if (!target) return undefined;
  return BUSINESS_NUMBERS.find((b) => lastDigits(b.digits) === target)?.label;
}

/** Converts common Israeli phone input shapes ("054-123-4567", "0541234567", "+972 54-123-4567") to the digits-only, country-code-prefixed format sendWhatsAppText/sendWhatsAppTemplate require (e.g. "972541234567") — no "+", no leading "0". */
export function toWhatsAppPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return `972${digits}`;
}

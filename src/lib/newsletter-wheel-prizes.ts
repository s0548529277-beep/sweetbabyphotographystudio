/**
 * The newsletter-signup "spin the wheel" prize wheel — separate from the
 * booking-confirmation wheel (wheel-prizes.ts): different trigger (checking
 * the newsletter opt-in checkbox at signup, not completing a booking),
 * different prize shape, and an exact distribution given by the studio
 * owner rather than a weighted pick — so kept as its own file rather than
 * generalizing the booking wheel's types.
 *
 * 10 segments, exactly as specified: 5% ×3, 7% ×3, 10% ×1, "spin again" ×2,
 * ₪20 credit ×1. A uniform random pick over this array already reproduces
 * those exact odds (3/10, 3/10, 1/10, 2/10, 1/10) — no separate weight
 * field needed, unlike the booking wheel's list.
 */
export type NewsletterWheelPrize =
  | { kind: "discount"; id: string; label: string; percent: number }
  | { kind: "credit"; id: string; label: string; amount: number }
  | { kind: "again"; id: string; label: string };

export const NEWSLETTER_WHEEL_PRIZES: NewsletterWheelPrize[] = [
  { kind: "discount", id: "d5a", label: "5% הנחה", percent: 5 },
  { kind: "discount", id: "d7a", label: "7% הנחה", percent: 7 },
  { kind: "discount", id: "d5b", label: "5% הנחה", percent: 5 },
  { kind: "again", id: "again_a", label: "סיבוב חוזר" },
  { kind: "discount", id: "d7b", label: "7% הנחה", percent: 7 },
  { kind: "discount", id: "d10", label: "10% הנחה", percent: 10 },
  { kind: "discount", id: "d5c", label: "5% הנחה", percent: 5 },
  { kind: "again", id: "again_b", label: "סיבוב חוזר" },
  { kind: "discount", id: "d7c", label: "7% הנחה", percent: 7 },
  { kind: "credit", id: "credit20", label: "20₪ מתנה", amount: 20 },
];

export function findNewsletterWheelPrize(id: string | null | undefined): NewsletterWheelPrize | null {
  return NEWSLETTER_WHEEL_PRIZES.find((p) => p.id === id) ?? null;
}

function pickOnce(): NewsletterWheelPrize {
  return NEWSLETTER_WHEEL_PRIZES[Math.floor(Math.random() * NEWSLETTER_WHEEL_PRIZES.length)];
}

// A "spin again" segment is 2/10 — chains extremely rarely in practice
// (P(6 in a row) ≈ 0.0064%), but MAX_AGAIN caps it anyway so a single spin
// can never loop forever; on that vanishingly unlikely cap-out, the last
// slot is forced to a real (non-"again") prize rather than surfacing an
// "again" as if it were final.
const MAX_AGAIN = 6;

/** Resolves one full spin server-side — returns the sequence of segments landed on, in order; the LAST entry is always the final, real prize. */
export function resolveNewsletterWheelSpin(): NewsletterWheelPrize[] {
  const sequence: NewsletterWheelPrize[] = [];
  for (let i = 0; i < MAX_AGAIN; i++) {
    const prize = pickOnce();
    sequence.push(prize);
    if (prize.kind !== "again") return sequence;
  }
  let final: NewsletterWheelPrize;
  do {
    final = pickOnce();
  } while (final.kind === "again");
  sequence.push(final);
  return sequence;
}

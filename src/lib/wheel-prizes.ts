/**
 * The "prize wheel" (גלגל המתנות) shown once to an eligible customer, on
 * her booking-confirmation page — see PrizeWheel.tsx for the visual wheel
 * and wheel.functions.ts for the server-side spin (which is where the
 * actual prize is picked — never trust the client to pick its own prize).
 *
 * Eligibility (studio-owner's rule — originally "over 3 hours", widened to
 * include exactly 3 hours too after real bookings showed the popular
 * newborn-morning package, which is always exactly 3 hours/6 slots, was
 * being excluded by a strict ">"):
 *  - a regular studio-rental booking of 3 HOURS OR MORE (slots >= 6 —
 *    slots are half-hours, see bookings.functions.ts), OR
 *  - ANY photography session/package with Michal herself
 *    (package === "photography" — see photography.functions.ts), any
 *    duration at all.
 * Client + server safe (no secrets) — imported from both the page
 * component (to render the wheel/gate the UI) and wheel.functions.ts (to
 * re-verify eligibility and pick the prize server-side).
 */
export function isEligibleForWheel(record: { package?: string | null; slots?: number | null } | null | undefined): boolean {
  if (!record) return false;
  if (record.package === "photography") return true;
  return Number(record.slots ?? 0) >= 6;
}

export type WheelPrize = {
  id: string;
  /** Short label shown on the wheel segment itself — keep it to 1-2 short words. */
  label: string;
  /** Full sentence shown after winning. */
  detail: string;
  /** Relative odds — all weights here sum to 100, purely for readability, not a hard requirement. */
  weight: number;
  /** "coupon" auto-mints a real single-use discount code (see wheel.functions.ts); "manual" is honored by Michal personally, same as everything else she manages by hand. */
  kind: "coupon" | "manual";
  couponPercent?: number;
};

// 8 segments — matches PrizeWheel.tsx's layout math (45° each). Keep this
// list at 8 items; adding/removing needs a matching adjustment there too.
export const WHEEL_PRIZES: WheelPrize[] = [
  { id: "half-hour", label: "חצי שעה מתנה", detail: "חצי שעה נוספת בסטודיו במתנה, לסשן הבא שלך", weight: 10, kind: "manual" },
  { id: "retouch", label: "עיבוד תמונה", detail: "עיבוד תמונה נוסף במתנה", weight: 15, kind: "manual" },
  { id: "discount5", label: "5% הנחה", detail: "5% הנחה בהזמנה הבאה שלך", weight: 20, kind: "coupon", couponPercent: 5 },
  { id: "extra-set", label: "סט נוסף", detail: "בניית סט צילום נוסף במתנה (בשווי ₪100)", weight: 10, kind: "manual" },
  { id: "accessory-day", label: "אביזר יום חינם", detail: "יום השכרת אביזר אחד מקטלוג האביזרים, במתנה", weight: 15, kind: "manual" },
  { id: "discount10", label: "10% הנחה", detail: "10% הנחה בהזמנה הבאה שלך", weight: 10, kind: "coupon", couponPercent: 10 },
  { id: "album-upgrade", label: "שדרוג אלבום", detail: "שדרוג קטן לאלבום/הדפסה, במתנה", weight: 10, kind: "manual" },
  { id: "surprise", label: "פינוק מתוק", detail: "פינוק קטן מחכה לך בסטודיו ביום הצילום ☕️🍰", weight: 10, kind: "manual" },
];

export function findWheelPrize(id: string | null | undefined): WheelPrize | null {
  return WHEEL_PRIZES.find((p) => p.id === id) ?? null;
}

/** Weighted random pick — server-side only call site (wheel.functions.ts), kept here since it's pure and prize-list-adjacent. */
export function pickWeightedPrize(): WheelPrize {
  const total = WHEEL_PRIZES.reduce((sum, p) => sum + p.weight, 0);
  let r = Math.random() * total;
  for (const p of WHEEL_PRIZES) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return WHEEL_PRIZES[WHEEL_PRIZES.length - 1];
}

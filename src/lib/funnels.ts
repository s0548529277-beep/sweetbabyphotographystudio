/**
 * משפכי שאלון (lead funnels) — everything Michal might want to edit lives here: the questions, the scoring and the
 * recommendation text of each funnel. Used by the dialog in the browser AND by funnels.functions.ts, which
 * recomputes score + recommendation on the server and never trusts the browser.
 *
 *   entry        — first question "who are you": a photographer (→ studio funnel) or a client (→ newborn / photography)
 *   studio       — /studio-rental: which punch card (כרטיסייה) fits how she really works in the studio
 *   photography  — /studio-photography: a session with Michal, studio or outdoor
 *   newborn      — /newborn: which newborn package, with or without the health-fund birth basket
 */
import { findNewbornPackage } from "@/lib/newborn-packages";

export type FunnelId = "entry" | "studio" | "photography" | "newborn";
export type LeadFunnelId = Exclude<FunnelId, "entry">;
export const LEAD_FUNNELS: LeadFunnelId[] = ["studio", "photography", "newborn"];

export const FUNNEL_LABELS: Record<FunnelId, string> = {
  entry: "שאלת פתיחה (צלמת או לקוחה)",
  studio: "השכרת סטודיו וכרטיסיות",
  photography: "צילומים עם מיכל",
  newborn: "צילומי ניו-בורן",
};

export type FunnelOption = {
  id: string;
  label: string;
  hint?: string;
  /** Entry funnel only: this answer sends her into another funnel. */
  goto?: LeadFunnelId;
};
export type FunnelQuestion = {
  id: string;
  title: string;
  options: FunnelOption[];
};

/* ----------------------------------------------------------------- entry */

export const ENTRY_QUESTION: FunnelQuestion = {
  id: "who",
  title: "איך נעים להכיר? מי את?",
  options: [
    { id: "photographer", label: "שכירת סטודיו", hint: "צלמת קבועה, צלמת חדשה או שכירות חד פעמית", goto: "studio" },
    { id: "newborn", label: "לקוחה — ניו-בורן", hint: "צילומי התינוק החדש", goto: "newborn" },
    { id: "client", label: "לקוחה — משפחה, ילדים או חוץ", hint: "סשן אצל מיכל", goto: "photography" },
  ],
};

/* ---------------------------------------------------------------- studio */

/** Punch cards (כרטיסיות): every entry covers the first hour. Prices as set by Michal; plans are managed in admin/subscriptions. */
export const STUDIO_FIRST_HOUR = 180;
export const STUDIO_EXTRA_HOUR = 100;
export const STUDIO_CARDS = [
  { id: "card5", name: "כרטיסייה 5 כניסות", entries: 5, price: 750 },
  { id: "card10", name: "כרטיסייה 10 כניסות", entries: 10, price: 1300 },
] as const;

/** "טעינה": pay 750, get 1,000 of studio credit. Only offered while the admin switch `studioTopup` is on (/admin/funnel-leads). */
export const STUDIO_TOPUP = { pay: 750, get: 1000 } as const;
/** The club: every registered customer collects 10% of each order of 100 ₪ or more as credit; returning photographers also get 10% off any amount. */
export const STUDIO_CASHBACK_NOTE = "כל הזמנה בסטודיו מ-100 ₪ צוברת 10% קרדיט להזמנה הבאה";
export const STUDIO_RETURNING_NOTE = "צלמות חוזרות מקבלות גם 10% הנחה בכל סכום";

const STUDIO_VISITS: Record<string, number> = { v0: 1, v1: 2, v2: 4, v3: 8, v4: 12 };
const STUDIO_HOURS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4 };

export const STUDIO_QUESTIONS: FunnelQuestion[] = [
  {
    id: "history",
    title: "איזה שימוש בסטודיו מתאים לך?",
    options: [
      { id: "regular", label: "צלמת קבועה", hint: "מצלמת בסטודיו כל חודש" },
      { id: "before", label: "צלמת, כבר צילמתי אצלכם פעם או פעמיים" },
      { id: "once", label: "שכירות חד פעמית", hint: "צילום משפחתי, אירוע או תוכן — לא צלמת קבועה" },
      { id: "new", label: "זו הפעם הראשונה שלי", hint: "עוד לא הייתי בסטודיו" },
    ],
  },
  {
    id: "visits",
    title: "כמה פעמים את מתכננת לצלם בסטודיו בחודשים הקרובים?",
    options: [
      { id: "v0", label: "פעם אחת בלבד" },
      { id: "v1", label: "2–3 פעמים" },
      { id: "v2", label: "4–6 פעמים" },
      { id: "v3", label: "7–10 פעמים" },
      { id: "v4", label: "יותר מ-10" },
    ],
  },
  {
    id: "hours",
    title: "כמה שעות בדרך כלל בכל כניסה?",
    options: [
      { id: "h1", label: "שעה" },
      { id: "h2", label: "שעתיים" },
      { id: "h3", label: "3 שעות" },
      { id: "h4", label: "4 שעות ויותר" },
    ],
  },
];

const STUDIO_DISCOUNT = 0.1; // returning photographers: 10% off any amount
const STUDIO_CASHBACK = 0.1; // every registered customer: 10% of each order of 100 ₪+ comes back as credit
const STUDIO_CASHBACK_MIN_ORDER = 100;

type CostRow = { id: string; name: string; total: number; cashback: number; net: number };

/** What each way of paying costs for `visits` visits of `hours` hours. `disc` = returning-photographer discount rate (0 or 0.1). Cashback is earned on every
 *  per-visit order whose LIST price is 100 ₪+ (the threshold ignores the returning-photographer discount; the credit is 10% of what is actually paid), NOT on buying a card or a top-up. `net` = total minus the cashback credit earned. */
function studioCost(visits: number, hours: number, topup: boolean, disc: number): CostRow[] {
  const k = 1 - disc;
  const extra = STUDIO_EXTRA_HOUR * (hours - 1) * k; // a covered visit still pays its extra hours
  const full = (STUDIO_FIRST_HOUR + STUDIO_EXTRA_HOUR * (hours - 1)) * k; // a visit with no card entry
  const cb = (orders: number[]) => orders.filter((o) => Math.round(o / k) >= STUDIO_CASHBACK_MIN_ORDER).reduce((sum, o) => sum + o * STUDIO_CASHBACK, 0);
  const mk = (id: string, name: string, total: number, orders: number[]): CostRow => {
    const cashback = Math.round(cb(orders));
    return { id, name, total: Math.round(total), cashback, net: Math.round(total) - cashback };
  };
  const rows: CostRow[] = [mk("none", "בלי כרטיסייה", visits * full, Array(visits).fill(full))];
  for (const c of STUDIO_CARDS) {
    const covered = Math.min(visits, c.entries);
    const uncovered = visits - covered;
    const orders = [...Array(covered).fill(extra), ...Array(uncovered).fill(full)];
    rows.push(mk(c.id, c.name, c.price * k + covered * extra + uncovered * full, orders));
  }
  if (topup) {
    const need = visits * full;
    rows.push(mk("topup", `טעינת ${STUDIO_TOPUP.pay} ₪ וקבלת ${STUDIO_TOPUP.get.toLocaleString("he-IL")} ₪`, STUDIO_TOPUP.pay + Math.max(0, need - STUDIO_TOPUP.get), []));
  }
  return rows;
}

function evalStudio(a: Record<string, string>, topup: boolean) {
  const visits = STUDIO_VISITS[a.visits] ?? 4;
  const hours = STUDIO_HOURS[a.hours] ?? 2;
  const returning = a.history === "regular" || a.history === "before";
  const disc = returning ? STUDIO_DISCOUNT : 0;
  const rows = studioCost(visits, hours, topup, disc);
  const best = rows.slice().sort((x, y) => x.net - y.net)[0];
  const none = rows[0];
  const saving = none.net - best.net;
  const n = (v: number) => v.toLocaleString("he-IL");
  let score = 0;
  if (visits >= 8) score += 3;
  else if (visits >= 4) score += 2;
  if (a.history === "regular") score += 2;
  else if (a.history === "before") score += 1;
  // A first-timer or a one-time renter: the first sign-up on the site earns a spin of the prize wheel.
  const signup = a.history === "once" || a.history === "new" || a.visits === "v0";
  const span = `${visits === 1 ? "כניסה אחת" : `${visits} כניסות`} של ${hours} ${hours === 1 ? "שעה" : "שעות"}`;
  const discNote = returning ? " כולל 10% הנחת צלמת חוזרת" : "";
  const rec0 =
    best.id === "none"
      ? `לפי מה שסיפרת (בערך ${span}) כרטיסייה עדיין לא משתלמת: ${n(none.total)} ₪ לכל התקופה${discNote}, ו-${n(none.cashback)} ₪ מזה חוזרים אלייך כקרדיט צבירה (10% מכל הזמנה מ-100 ₪). שעה ראשונה ${STUDIO_FIRST_HOUR} ₪ וכל שעה נוספת ${STUDIO_EXTRA_HOUR} ₪.`
      : `${best.name} משתלמת לך: בערך ${n(best.total)} ₪${best.cashback > 0 ? ` (ועוד ${n(best.cashback)} ₪ קרדיט צבירה שחוזר אלייך)` : ""} במקום ${n(none.total)} ₪ בלי כרטיסייה${none.cashback > 0 ? ` (שמחזירים ${n(none.cashback)} ₪ קרדיט)` : ""} — חיסכון נטו של כ-${n(saving)} ₪ (לפי ${span}${discNote}).`;
  const leftover = best.id === "topup" ? Math.max(0, STUDIO_TOPUP.get - none.total) : 0;
  const rec1 = leftover > 0 ? `${rec0} יישאר לך קרדיט של ${n(leftover)} ₪ להזמנות הבאות.` : rec0;
  const rec = signup ? `${rec1} וכשנרשמים לאתר בפעם הראשונה מקבלים סיבוב בגלגל המתנות 🎁 — הנחה או קרדיט להזמנה.` : rec1;
  return {
    score,
    hot: score >= 4,
    recommendation: rec,
    headline: best.id === "none" ? "תשלום לפי שעה" : best.name,
    details: [
      ...rows.map((r) => `${r.name}: ${n(r.total)} ₪${r.cashback > 0 ? ` · קרדיט צבירה ${n(r.cashback)} ₪ (נטו ${n(r.net)} ₪)` : ""}`),
      STUDIO_CASHBACK_NOTE + " (נרשמות לאתר, והקרדיט נצבר לבד)",
      ...(returning ? [STUDIO_RETURNING_NOTE + " — כלולה בחישוב"] : []),
    ],
    signup,
  };
}

/* ----------------------------------------------------------- photography */

export const PHOTOGRAPHY_QUESTIONS: FunnelQuestion[] = [
  {
    id: "where",
    title: "איפה תרצי לצלם?",
    options: [
      { id: "studio", label: "בסטודיו" },
      { id: "outdoor", label: "בחוץ, בטבע" },
      { id: "unsure", label: "עוד לא יודעת" },
    ],
  },
  {
    id: "what",
    title: "מה תרצי לצלם?",
    options: [
      { id: "kids", label: "ילדים" },
      { id: "family", label: "משפחה" },
      { id: "birthday", label: "יום הולדת / סמאש קייק" },
      { id: "other", label: "משהו אחר" },
    ],
  },
  {
    id: "when",
    title: "מתי?",
    options: [
      { id: "soon", label: "בשבועיים הקרובים" },
      { id: "month", label: "החודש" },
      { id: "later", label: "בעוד כמה חודשים" },
    ],
  },
  {
    id: "priority",
    title: "מה הכי חשוב לך?",
    options: [
      { id: "digital", label: "תמונות דיגיטליות" },
      { id: "album", label: "אלבום מודפס" },
      { id: "wall", label: "תמונה גדולה לקיר" },
    ],
  },
];

function evalPhotography(a: Record<string, string>) {
  let score = 0;
  if (a.when === "soon") score += 3;
  else if (a.when === "month") score += 2;
  if (a.priority === "album" || a.priority === "wall") score += 1;
  const place =
    a.where === "outdoor"
      ? "צילומי חוץ מתואמים אישית (לוקיישן ומועד לפי השקיעה והעונה), ומיכל תחזור אלייך עם הצעה מדויקת."
      : a.where === "studio"
        ? "בסטודיו נתאים יחד את משך הסשן ומספר הסטים, בדרך כלל כשני סטים בשעה."
        : "אפשר גם בסטודיו וגם בחוץ — נבחר יחד מה מתאים לך.";
  const extra =
    a.priority === "album" || a.priority === "wall"
      ? " כי חשוב לך מוצר מודפס, מיכל תתאים לך חבילה עם אלבום או תמונה לקיר."
      : "";
  return {
    score,
    hot: score >= 4,
    recommendation: `${place}${extra}`,
    headline: a.where === "outdoor" ? "סשן חוץ עם מיכל" : "סשן עם מיכל",
    details: [] as string[],
  };
}

/* --------------------------------------------------------------- newborn */

export const NEWBORN_QUESTIONS: FunnelQuestion[] = [
  {
    id: "stage",
    title: "איפה את עכשיו?",
    options: [
      { id: "born", label: "התינוק נולד לפני פחות משבועיים" },
      { id: "due_soon", label: "בהריון, ממש לקראת הלידה" },
      { id: "due_later", label: "בהריון, עוד יש זמן" },
      { id: "older", label: "התינוק כבר בן יותר משבועיים" },
    ],
  },
  {
    id: "basket",
    title: "שמעת שאפשר לממש את סל הלידה של קופת החולים בצילומי ניו-בורן?",
    options: [
      { id: "yes", label: "כן, ויש לי כללית / מכבי / לאומית" },
      { id: "tell", label: "לא, ספרי לי!" },
      { id: "no", label: "לא רלוונטי לי" },
    ],
  },
  {
    id: "priority",
    title: "מה הכי חשוב לך?",
    options: [
      { id: "digital", label: "תמונות מעובדות, בלי יותר מדי" },
      { id: "album", label: "אלבום מודפס" },
      { id: "full", label: "הכול: סטים, אחים, הורים ואלבום" },
    ],
  },
];

function evalNewborn(a: Record<string, string>) {
  let score = 0;
  if (a.stage === "born") score += 3;
  else if (a.stage === "due_soon") score += 3;
  else if (a.stage === "due_later") score += 1;
  if (a.basket === "yes" || a.basket === "tell") score += 2;
  if (a.priority === "album" || a.priority === "full") score += 1;
  const basket = a.basket === "yes" || a.basket === "tell";
  const id =
    a.priority === "full" ? (basket ? "basket_1600" : "dreamy") : a.priority === "album" ? "pampering" : basket ? "basket_500" : "mini";
  const pkg = findNewbornPackage(id);
  const when =
    a.stage === "born"
      ? "מומלץ לצלם בשבועיים הראשונים, אז כדאי לתאם בהקדם."
      : a.stage === "due_soon"
        ? "כדאי לשריין תאריך כבר עכשיו כדי שיהיה מקום בשבועיים הראשונים."
        : a.stage === "older"
          ? "מיכל תבדוק איתך מה אפשרי בגיל התינוק."
          : "יש זמן, אבל כדאי לשריין מראש.";
  return {
    score,
    hot: score >= 5,
    recommendation: pkg
      ? `החבילה שהכי מתאימה לך: ${pkg.name} · ${pkg.price.toLocaleString("he-IL")} ₪. ${when}${basket ? " ואפשר לממש את סל הלידה של הקופה." : ""}`
      : `מיכל תתאים לך חבילה. ${when}`,
    headline: pkg ? `${pkg.name} · ${pkg.price.toLocaleString("he-IL")} ₪` : "חבילת ניו-בורן",
    details: pkg ? pkg.features : [],
  };
}

/* ---------------------------------------------------------------- shared */

export const FUNNEL_QUESTIONS: Record<LeadFunnelId, FunnelQuestion[]> = {
  studio: STUDIO_QUESTIONS,
  photography: PHOTOGRAPHY_QUESTIONS,
  newborn: NEWBORN_QUESTIONS,
};

/** `signup`: show the "register for the first time and spin the prize wheel" button on the result screen. */
export type FunnelResult = { score: number; hot: boolean; recommendation: string; headline: string; details: string[]; signup?: boolean };

/** The answers must be a complete, valid set for this funnel (every question answered with one of its own options). */
export function validateAnswers(funnel: LeadFunnelId, answers: Record<string, string>): boolean {
  return FUNNEL_QUESTIONS[funnel].every((q) => q.options.some((o) => o.id === answers[q.id]));
}

export function evaluateFunnel(funnel: LeadFunnelId, answers: Record<string, string>, opts: { topup?: boolean } = {}): FunnelResult {
  if (funnel === "studio") return evalStudio(answers, !!opts.topup);
  if (funnel === "photography") return evalPhotography(answers);
  return evalNewborn(answers);
}

/** Readable "question: answer" lines, for the admin and the lead email. */
export function answerLines(funnel: LeadFunnelId, answers: Record<string, string>): { q: string; a: string }[] {
  return FUNNEL_QUESTIONS[funnel].map((q) => ({ q: q.title, a: q.options.find((o) => o.id === answers[q.id])?.label ?? "—" }));
}

/** On/off switches: the four funnels (default ON) + `studioTopup`, the "load 750, get 1,000" offer inside the studio funnel (default OFF). */
export type FunnelSettings = Record<FunnelId, boolean> & { studioTopup: boolean };
export const DEFAULT_FUNNEL_SETTINGS: FunnelSettings = { entry: true, studio: true, photography: true, newborn: true, studioTopup: false };

export function parseFunnelSettings(raw: string | null | undefined): FunnelSettings {
  try {
    const v = JSON.parse(raw || "{}");
    return {
      entry: v.entry !== false,
      studio: v.studio !== false,
      photography: v.photography !== false,
      newborn: v.newborn !== false,
      studioTopup: v.studioTopup === true,
    };
  } catch {
    return { ...DEFAULT_FUNNEL_SETTINGS };
  }
}

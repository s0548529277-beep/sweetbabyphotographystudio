/** Shared constants for the newborn-package admin order tracker (client + server safe). See newborn-orders.functions.ts and /admin/newborn-packages. */

export type NewbornPackage = { id: string; name: string; price: number; features: string[] };

// Prices/content exactly as given, with one typo correction: the middle
// package's price was written as "13200" right next to "1650" for the next
// package — kept 1320 instead (sits naturally between 900 and 1650); flag
// to Michal if that guess is wrong, it's a one-line fix in this file.
export const NEWBORN_PACKAGES: NewbornPackage[] = [
  { id: "mini", name: "חבילה מיני", price: 900, features: ["3 סטים", "8 תמונות מעובדות", "קולאז'"] },
  {
    id: "pampering",
    name: "חבילה מפנקת",
    price: 1320,
    features: ["4 סטים", "סט הורים/אחים", "12 תמונות מעובדות", "קולאז'", "אלבום"],
  },
  {
    id: "dreamy",
    name: "חבילה חלומית",
    price: 1650,
    features: ["5 סטים", "15 תמונות מעובדות", "קולאז'", "סט הורים", "סט אחים", "אלבום"],
  },
];

export type NewbornAddon = { id: string; label: string; price: number };

export const NEWBORN_ADDONS: NewbornAddon[] = [
  { id: "extra_set", label: "הוספת סט", price: 250 },
  { id: "album_upgrade", label: "שדרוג אלבום", price: 150 },
  { id: "travel", label: "תוספת נסיעות", price: 150 },
  { id: "food_retouch", label: "עיבוד תמונה נוספת (אוכל)", price: 40 },
];

export function findNewbornPackage(id: string | null | undefined): NewbornPackage | null {
  return NEWBORN_PACKAGES.find((p) => p.id === id) ?? null;
}

/** The 8-step pipeline Michal described, in order — `key` maps directly to the `${key}_at` column on newborn_package_orders. */
export const NEWBORN_TIMELINE_STEPS: { key: string; label: string }[] = [
  { key: "date_deposit", label: "סגירת תאריך והעברת מקדמה" },
  { key: "shoot_done", label: "יום הצילומים בוצע" },
  { key: "photos_sent", label: "שליחת תמונות" },
  { key: "payment_done", label: "סיום תשלום" },
  { key: "editing_done", label: "עיבוד תמונות" },
  { key: "album_design_done", label: "עיצוב אלבום" },
  { key: "printing_done", label: "הדפסה" },
  { key: "delivered", label: "הגיעה ללקוחה" },
];

export const NEWBORN_TIMELINE_STEP_KEYS = NEWBORN_TIMELINE_STEPS.map((s) => s.key);

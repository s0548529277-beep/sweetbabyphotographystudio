/** Shared constants for the newborn-package admin order tracker (client + server safe). See newborn-orders.functions.ts and /admin/newborn-packages. */

export type NewbornPackageCategoryId = "regular" | "birth_basket";

export const NEWBORN_PACKAGE_CATEGORIES: { id: NewbornPackageCategoryId; label: string }[] = [
  { id: "regular", label: "חבילות רגילות" },
  // "סל לידה" = the קופת חולים birth-basket benefit (see photography-options.ts's
  // own doc comment on how it works) — a separate, lower price tier for
  // customers redeeming that benefit rather than paying full price.
  { id: "birth_basket", label: "ניו-בורן מימוש סל לידה" },
];

// sets/hasCollage/hasAlbum are structured duplicates of what the `features`
// strings already say in prose (e.g. "3 סטים", "קולאז'", "אלבום") — kept as
// real fields instead of parsed out of that free text so the order table
// (/admin/newborn-packages, "טבלה" view) and calendar sync can read them
// directly rather than fragile substring matching. `sessions` is 1 for
// every package except the "1600" basket deal, which is 3 separate
// photography sessions rather than 3 sets within one session — the order
// tracker still only carries a single session_date/session_time (the next
// upcoming session); the other sessions are tracked via notes, same as any
// other multi-visit arrangement this lightweight tool doesn't model
// natively. `categories` lets one package (currently "pampering") appear
// under more than one heading in the picker instead of being duplicated
// under a second id — duplicating would orphan any existing order that
// already references the original id.
export type NewbornPackage = {
  id: string;
  name: string;
  price: number;
  features: string[];
  photosToEdit: number;
  sets: number;
  sessions: number;
  hasCollage: boolean;
  hasAlbum: boolean;
  categories: NewbornPackageCategoryId[];
};

export const NEWBORN_PACKAGES: NewbornPackage[] = [
  {
    id: "mini",
    name: "חבילה מיני",
    price: 900,
    features: ["3 סטים", "8 תמונות מעובדות", "קולאז'"],
    photosToEdit: 8,
    sets: 3,
    sessions: 1,
    hasCollage: true,
    hasAlbum: false,
    categories: ["regular"],
  },
  {
    id: "pampering",
    name: "חבילה מפנקת",
    price: 1200,
    features: ["4 סטים", "סט הורים/אחים", "12 תמונות מעובדות", "קולאז'", "אלבום"],
    photosToEdit: 12,
    sets: 4,
    sessions: 1,
    hasCollage: true,
    hasAlbum: true,
    // Also shown under "ניו-בורן מימוש סל לידה" per explicit request — same
    // package, same id/price, just listed under both headings in the picker.
    categories: ["regular", "birth_basket"],
  },
  {
    id: "dreamy",
    name: "חבילה חלומית",
    price: 1650,
    features: ["5 סטים", "15 תמונות מעובדות", "קולאז'", "סט הורים", "סט אחים", "אלבום"],
    photosToEdit: 15,
    sets: 5,
    sessions: 1,
    hasCollage: true,
    hasAlbum: true,
    categories: ["regular"],
  },
  {
    id: "basket_500",
    name: "חבילת סל 500",
    price: 500,
    features: ["סט ניו-בורן אחד", "4 תמונות מעובדות", "קולאז'"],
    photosToEdit: 4,
    sets: 1,
    sessions: 1,
    hasCollage: true,
    hasAlbum: false,
    categories: ["birth_basket"],
  },
  {
    id: "basket_1600",
    name: "חבילת סל 1600",
    price: 1600,
    features: ["3 סשנים", "8 תמונות מעובדות", "קולאז'"],
    photosToEdit: 8,
    sets: 1,
    sessions: 3,
    hasCollage: true,
    hasAlbum: false,
    categories: ["birth_basket"],
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

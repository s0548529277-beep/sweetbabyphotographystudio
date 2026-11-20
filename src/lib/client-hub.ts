// Unified client list for /admin/newborn-packages ("ניהול לקוחות"): newborn packages, outdoor shoots,
// custom studio packages and general photo clients in one page. Each source table keeps its own shape; this file only normalises
// them into one row type for the shared views (dashboard / calendar / table / payments).
//
// Colours (owner request 2026-11-19): ניו-בורן = ורוד, צילומי חוץ = חום, סטודיו מותאם אישית = בז',
// צילום כללי (2026-11-20) = ירוק עדין.
// The palettes live in styles.css as .kind-newborn / .kind-outdoor / .kind-studio wrapper classes.
import { findNewbornPackage } from "@/lib/newborn-packages";

export type HubKind = "newborn" | "outdoor" | "studio" | "general";
export type HubFilter = HubKind | "all";

export const HUB_KINDS: {
  key: HubKind;
  label: string;
  /** wrapper class that applies the kind's colour palette (styles.css) */
  scope: string;
  /** solid dot / strip colour (never remapped by a scope) */
  dot: string;
  /** soft tinted badge */
  badge: string;
  /** calendar chip tone */
  tone: string;
  /** coloured side border of the payment cards */
  stripe: string;
}[] = [
  {
    key: "newborn",
    label: "ניו-בורן",
    scope: "kind-newborn",
    dot: "bg-hub-newborn",
    badge: "bg-hub-newborn-blush text-hub-newborn",
    tone: "bg-hub-newborn-blush text-hub-newborn",
    stripe: "border-r-hub-newborn",
  },
  {
    key: "outdoor",
    label: "צילומי חוץ",
    scope: "kind-outdoor",
    dot: "bg-outdoor-rose",
    badge: "bg-outdoor-blush text-outdoor-rose",
    tone: "bg-outdoor-blush text-outdoor-ink",
    stripe: "border-r-outdoor-rose",
  },
  {
    key: "studio",
    label: "סטודיו מותאם",
    scope: "kind-studio",
    dot: "bg-studio-rose",
    badge: "bg-studio-blush text-studio-ink",
    tone: "bg-studio-blush text-studio-ink",
    stripe: "border-r-studio-rose",
  },
  {
    key: "general",
    label: "צילום כללי",
    scope: "kind-general",
    dot: "bg-general-rose",
    badge: "bg-general-blush text-general-ink",
    tone: "bg-general-blush text-general-ink",
    stripe: "border-r-general-rose",
  },
];

export const hubKind = (k: HubKind) => HUB_KINDS.find((x) => x.key === k)!;

export type HubRow = {
  kind: HubKind;
  id: string;
  name: string;
  phone: string;
  email: string | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM
  packageName: string;
  total: number;
  paid: number;
  lastPaymentAt: string | null;
  notes: string | null;
  createdAt: string;
  galleryOpenedAt: string | null;
  /** the untouched source row, for the kind's own card / dialogs */
  raw: any;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function newbornToHub(o: any): HubRow {
  return {
    kind: "newborn",
    id: o.id,
    name: o.contact_name,
    phone: o.contact_phone,
    email: o.contact_email ?? null,
    date: o.session_date ?? null,
    time: o.session_time ? String(o.session_time).slice(0, 5) : null,
    packageName: findNewbornPackage(o.package_id)?.name ?? o.package_id ?? "",
    total: num(o.total_price),
    paid: num(o.amount_paid),
    lastPaymentAt: o.last_payment_at ?? null,
    notes: o.notes ?? null,
    createdAt: o.created_at,
    galleryOpenedAt: o.gallery_opened_at ?? null,
    raw: o,
  };
}

export function outdoorToHub(o: any): HubRow {
  return {
    kind: "outdoor",
    id: o.id,
    name: o.contact_name,
    phone: o.contact_phone,
    email: o.contact_email ?? null,
    date: o.session_date ?? null,
    time: o.session_time ? String(o.session_time).slice(0, 5) : null,
    packageName: o.package_name ?? "צילומי חוץ",
    total: num(o.total_price),
    paid: num(o.amount_paid),
    lastPaymentAt: o.last_payment_at ?? null,
    notes: o.notes ?? null,
    createdAt: o.created_at,
    galleryOpenedAt: null,
    raw: o,
  };
}

export function studioToHub(o: any): HubRow {
  return {
    kind: "studio",
    id: o.id,
    name: o.contact_name,
    phone: o.contact_phone,
    email: o.contact_email ?? null,
    date: o.session_date ?? null,
    time: o.session_time ? String(o.session_time).slice(0, 5) : null,
    packageName: o.package_name ?? "סטודיו מותאם אישית",
    total: num(o.total_price),
    paid: num(o.amount_paid),
    lastPaymentAt: o.last_payment_at ?? null,
    notes: o.notes ?? null,
    createdAt: o.created_at,
    galleryOpenedAt: null,
    raw: o,
  };
}

/**
 * General photo clients (photo_client_workflows, listed by listPhotoClients). `packageName` is
 * resolved by the caller (the package labels live in a server-function module).
 * "Send photos only" clients (no package, no editing) are flagged on `raw.sendOnly`.
 */
export function generalToHub(r: any, packageName: string): HubRow {
  return {
    kind: "general",
    id: r.id,
    name: r.contact_name,
    phone: r.contact_phone && r.contact_phone !== "—" ? r.contact_phone : "",
    email: r.contact_email || null,
    date: r.session_date ? String(r.session_date).slice(0, 10) : null,
    time: r.session_time ? String(r.session_time).slice(0, 5) : null,
    packageName,
    total: num(r.total_price),
    paid: num(r.amount_paid),
    lastPaymentAt: null,
    notes: r.location ?? null,
    createdAt: r.created_at ?? "",
    galleryOpenedAt: null,
    raw: { ...r, sendOnly: !r.has_package && r.wants_editing === false },
  };
}

/**
 * "Work in progress": the shoot happened but the client is not done yet. Newborn / outdoor: the date has
 * passed and nothing was delivered. General: waiting for her pick or for edited photos, or the shoot date
 * has passed without the album being published. Custom studio hours are never "in progress".
 */
export function hubInProgress(r: HubRow, today: string): boolean {
  if (r.kind === "studio") return false;
  if (r.kind === "general") {
    const stage = r.raw?.stage as string | undefined;
    if (r.raw?.sendOnly || stage === "album_published") return false;
    if (stage === "proofs_ready" || stage === "edited_uploaded") return true;
    return !!r.date && r.date < today;
  }
  return !!r.date && r.date < today && !r.raw?.delivered_at;
}

export const hubBalance = (r: HubRow) => Math.max(0, r.total - r.paid);
export const hubIsPaid = (r: HubRow) => r.total > 0 && r.paid >= r.total;

/** Latest first by creation time — the order the newborn list always used. */
export function sortHubRows(rows: HubRow[]): HubRow[] {
  return [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

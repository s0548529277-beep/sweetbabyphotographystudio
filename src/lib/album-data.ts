/**
 * Shared types + pure helpers for the "בניית אלבום מותאם אישית" customer
 * wizard (/album-builder) and its admin page (/admin/albums). Ported
 * 2026-10-27 from the Sept 3 branch claude/email-search-rpn6jn. Deliberately reuses the SAME
 * slot-rect layout math already built and proven in the free
 * /collage-maker tool (collage-data.ts) instead of inventing a second,
 * parallel layout system — a template's "page" here is just a photo count
 * + one of collage-data.ts's own layout-variant ids, not a bespoke
 * freeform design (explicit decision, 2026-09-03: simple template+swap
 * editor first, not a full drag/resize canvas). No secrets, no server
 * dependency — safe to import from client-rendered route components.
 */
import {
  CAPTION_GROUPS,
  CAPTION_TRANSLATIONS,
  getLayoutVariants,
  type SlotRect,
} from "./collage-data";

export { CAPTION_GROUPS, CAPTION_TRANSLATIONS };

export type AlbumShapeRow = {
  id: string;
  slug: string;
  name_he: string;
  name_en: string;
  sort_order: number;
  is_active: boolean;
};

export type AlbumSizeRow = {
  id: string;
  shape_id: string;
  label_he: string;
  width_cm: number;
  height_cm: number;
  base_price: number;
  price_per_extra_page: number;
  min_pages: number;
  max_pages: number;
  sort_order: number;
  is_active: boolean;
};

/** One page inside a template's template_data.pages — photoCount picks which of getLayoutVariants(photoCount) applies (via layoutId), hasCaption adds one free-text caption slot under/over the photos. */
export type AlbumTemplatePage = {
  layoutId: string;
  photoCount: number;
  hasCaption: boolean;
};

export type AlbumTemplateData = { pages: AlbumTemplatePage[] };

export type AlbumTemplateRow = {
  id: string;
  shape_id: string;
  name: string;
  category: string | null;
  thumbnail_url: string | null;
  template_data: AlbumTemplateData;
  min_pages: number | null;
  max_pages: number | null;
  sort_order: number;
  is_active: boolean;
};

/** Common categories offered when creating/filtering templates — a starting list, not exhaustive (admin can type any value; this just powers the filter chips). */
export const ALBUM_TEMPLATE_CATEGORIES = ["ניו-בורן", "ברית", "חלאקה", "בר מצווה", "משפחה", "כללי"];

/** The slot rects for one template page, resolved via collage-data.ts's own layout variants — falls back to that photo count's first variant if the saved layoutId no longer exists (e.g. an old template referencing a removed layout). */
export function resolveAlbumPageRects(page: AlbumTemplatePage): SlotRect[] {
  const variants = getLayoutVariants(page.photoCount);
  return (variants.find((v) => v.id === page.layoutId) ?? variants[0])?.rects ?? [];
}

/** Total price for a given size + page count: base price covers min_pages, every page past that costs price_per_extra_page —  */
export function albumPrice(
  size: Pick<AlbumSizeRow, "base_price" | "price_per_extra_page" | "min_pages">,
  pages: number,
): number {
  const extra = Math.max(0, pages - size.min_pages);
  return size.base_price + extra * size.price_per_extra_page;
}

/** One uploaded photo (or still-empty) slot inside a page's design, as saved in album_orders.design_json. */
export type AlbumDesignSlot = { path: string | null; url: string | null };

export type AlbumDesignPage = {
  layoutId: string;
  photoCount: number;
  slots: AlbumDesignSlot[];
  caption: string | null;
};

export type AlbumDesign = {
  templateId: string;
  templateName: string;
  pages: AlbumDesignPage[];
};

/** A fresh, empty design derived from a template — every photo slot starts unfilled, every caption starts blank. */
export function emptyAlbumDesign(template: AlbumTemplateRow): AlbumDesign {
  return {
    templateId: template.id,
    templateName: template.name,
    pages: template.template_data.pages.map((p) => ({
      layoutId: p.layoutId,
      photoCount: p.photoCount,
      slots: Array.from({ length: p.photoCount }, () => ({ path: null, url: null })),
      caption: p.hasCaption ? "" : null,
    })),
  };
}

/** True once every photo slot across every page has an uploaded photo — gates the final "המשך להזמנה" step. */
export function isAlbumDesignComplete(design: AlbumDesign): boolean {
  return design.pages.every((p) => p.slots.every((s) => !!s.path));
}

/** Album-order workflow statuses (album_orders.status) — admin-only labels/colors. */
export const ALBUM_ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "חדשה", cls: "bg-rose-100 text-rose-800" },
  in_design: { label: "בעיצוב", cls: "bg-amber-100 text-amber-800" },
  sent_for_approval: { label: "נשלח לאישור", cls: "bg-sky-100 text-sky-800" },
  approved: { label: "אושר", cls: "bg-emerald-100 text-emerald-800" },
  printing: { label: "בהדפסה", cls: "bg-violet-100 text-violet-800" },
  delivered: { label: "נמסר ✓", cls: "bg-stone-200 text-stone-700" },
  cancelled: { label: "בוטל", cls: "bg-stone-100 text-stone-500" },
};

export type AlbumOrderRow = {
  id: string;
  user_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  shape_id: string | null;
  size_id: string | null;
  template_id: string | null;
  summary: string | null;
  pages: number;
  price: number;
  design_json: AlbumDesign;
  customer_notes: string | null;
  status: string;
  admin_notes: string | null;
  newborn_order_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AlbumExampleRow = {
  id: string;
  title: string;
  url: string;
  category: string | null;
  note: string | null;
  sort_order: number;
};

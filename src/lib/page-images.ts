import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { studioInspirationMap } from "@/lib/inspiration";
import { STATIC_CATALOG } from "@/lib/catalog";
import heartGradientDefault from "@/assets/heart-gradient.png";

/** Absolute URL (email clients can't resolve relative/build-hashed paths) for the bundled default heart, used until she uploads her own via /admin/gallery. */
const DEFAULT_EMAIL_HEART_URL = `https://sweetbabyphoto.shop${heartGradientDefault}`;

/**
 * These config values (chat avatar, site heart icon, hero design) are fetched
 * client-side from Supabase after mount, so the very first render always has
 * to show *something* before that fetch resolves — previously that was the
 * bundled default, which flashed for ~1s on every load even when the admin
 * had picked something else, then swapped. Caching the last-resolved value in
 * localStorage and using it as the initial render (instead of the bundled
 * default) removes that flash for every visit after the first.
 */
const CONFIG_CACHE_PREFIX = "sb-cfg:";

function readConfigCache(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CONFIG_CACHE_PREFIX + key);
  } catch {
    return null;
  }
}

function writeConfigCache(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(CONFIG_CACHE_PREFIX + key);
    else window.localStorage.setItem(CONFIG_CACHE_PREFIX + key, value);
  } catch {
    // localStorage can throw (private mode, quota) — the cache is a nice-to-have, never load-bearing
  }
}

export const PAGE_IMAGE_KEYS = {
  studioRental: "studio-rental",
  photographyStudio: "photography-studio",
  photographyOutdoor: "photography-outdoor",
  homeHero: "home-hero",
  rentalInspiration: "rental-inspiration",
  about: "about",
  newborn: "newborn",
  // Photos shown in the birth-basket ("סל לידה") auto-reply email sent to
  // a customer who clicks "מעוניינת במימוש סל לידה" on /newborn — managed
  // from /admin/gallery like any other page, admin-editable text lives
  // separately at /admin/birth-basket-text (see birthBasketInfo.ts).
  birthBasket: "birth-basket",
} as const;

export type PageImageKey = (typeof PAGE_IMAGE_KEYS)[keyof typeof PAGE_IMAGE_KEYS];

export type PageImage = {
  id: string;
  page: string;
  url: string;
  storage_path: string | null;
  caption: string | null;
  sort_order: number;
  source: string;
  hidden: boolean;
  created_at: string;
};

export const BUILTIN_PHOTOGRAPHY_STUDIO = [
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04166_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04088_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc03989_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04141_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04290_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04418_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc07818_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc08152_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/08/dsc04298_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/08/dsc04579_optimized-scaled.jpg",
];

export const BUILTIN_PHOTOGRAPHY_OUTDOOR = [
  "https://michalsiboni.co.il/wp-content/uploads/2025/05/777-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/05/DSC01673-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/05/DSC04181-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/05/DSC08770-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01210_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01367_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01467_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01597_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01673_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc02946_optimized-scaled.jpg",
];

/** Bundled home-hero slides (the rotating rectangle on the homepage). */
export function builtinHomeHero(): { key: string; url: string }[] {
  const mods = import.meta.glob("../assets/home-hero-*.asset.json", { eager: true }) as Record<
    string,
    { default?: { url: string }; url?: string }
  >;
  return Object.entries(mods)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, mod]) => ({ key, url: mod.default?.url ?? mod.url ?? "" }))
    .filter((e) => e.url);
}

/**
 * Bundled images shipped with the site, keyed by a STABLE key.
 * Studio photos are bundled assets whose URL changes between builds, so the
 * source path is used as key and the URL resolved at runtime.
 */
export function builtinEntries(page: string): { key: string; url: string }[] {
  if (page === PAGE_IMAGE_KEYS.studioRental) {
    return Object.entries(studioInspirationMap()).map(([key, url]) => ({ key, url }));
  }
  if (page === PAGE_IMAGE_KEYS.photographyStudio)
    return BUILTIN_PHOTOGRAPHY_STUDIO.map((u) => ({ key: u, url: u }));
  if (page === PAGE_IMAGE_KEYS.photographyOutdoor)
    return BUILTIN_PHOTOGRAPHY_OUTDOOR.map((u) => ({ key: u, url: u }));
  if (page === PAGE_IMAGE_KEYS.homeHero) return builtinHomeHero();
  // Deliberately no bundled fallback for newborn — per explicit request,
  // this gallery must show only real newborn photos she's uploaded via
  // /admin/gallery, never the general studio-session stock photos (which
  // mix in non-newborn shots). Empty until she's uploaded her own.
  if (page === PAGE_IMAGE_KEYS.newborn) return [];
  if (page === PAGE_IMAGE_KEYS.rentalInspiration) {
    return STATIC_CATALOG.flatMap((c) => c.items)
      .filter((i) => i.hasHand && i.img)
      .map((i) => ({ key: i.img, url: i.img }));
  }
  return [];
}

export function builtinPageImages(page: string): string[] {
  return builtinEntries(page).map((e) => e.url);
}

/** Current URL of a bundled image, by its stable key. */
export function builtinUrl(page: string, key: string | null | undefined): string | null {
  if (!key) return null;
  return builtinEntries(page).find((e) => e.key === key)?.url ?? null;
}

/** The display URL for a gallery row (bundled rows resolve to their live asset URL). */
export function rowUrl(page: string, row: PageImage): string {
  return (row.source === "builtin" ? builtinUrl(page, row.storage_path) : null) ?? row.url;
}

export async function fetchPageImages(page: string): Promise<PageImage[]> {
  const { data, error } = await supabase
    .from("page_images")
    .select("*")
    .eq("page", page)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PageImage[];
}

/** Client-side hook: images managed from the admin panel for a given page. */
export function usePageImages(page: string) {
  return useQuery({
    queryKey: ["page-images", page],
    queryFn: () => fetchPageImages(page),
    staleTime: 60_000,
  });
}

/**
 * Gallery shown on the site: every managed row that isn't hidden, plus bundled
 * photos that haven't been adopted into the gallery yet (first visit to admin
 * adopts them, after which order + deletions are fully admin-controlled).
 */
export function resolveGalleryImages(page: string, rows: PageImage[] | undefined): string[] {
  const list = rows ?? [];
  const adoptedKeys = new Set(
    list.filter((r) => r.source === "builtin").map((r) => r.storage_path ?? ""),
  );
  const pending = builtinEntries(page)
    .filter((e) => !adoptedKeys.has(e.key))
    .map((e) => e.url);
  const managed = list
    .filter((r) => !r.hidden && r.source !== "config")
    .map((r) => rowUrl(page, r));
  return Array.from(new Set([...pending, ...managed]));
}

/** Resolved, ordered gallery for a page (built-ins + uploads, respecting admin edits). */
export function usePageGallery(page: string) {
  const query = usePageImages(page);
  return { ...query, images: resolveGalleryImages(page, query.data) };
}

/** Layout setting rows (kept hidden so they never render in a gallery). */
export type GalleryAspect = "portrait" | "landscape";

export function resolveAspect(rows: PageImage[] | undefined): GalleryAspect {
  const row = (rows ?? []).find((r) => r.source === "config");
  return row?.caption === "landscape" ? "landscape" : "portrait";
}

export async function saveAspect(page: string, aspect: GalleryAspect) {
  const rows = await fetchPageImages(page);
  const existing = rows.find((r) => r.source === "config");
  if (existing) {
    const { error } = await supabase
      .from("page_images")
      .update({ caption: aspect })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("page_images")
    .insert({ page, url: "", source: "config", caption: aspect, hidden: true, sort_order: 9999 });
  if (error) throw error;
}

/** Resolved gallery + layout aspect for a page. */
export function usePageGalleryWithAspect(page: string) {
  const query = usePageImages(page);
  return {
    ...query,
    images: resolveGalleryImages(page, query.data),
    aspect: resolveAspect(query.data),
  };
}

/**
 * One-click homepage hero design switcher — per explicit request, so
 * choosing between the site's past hero designs doesn't need a developer.
 * Reuses the same "config" row trick as saveAspect/resolveAspect above,
 * under its own synthetic page key so it never mixes with real gallery
 * rows (no schema change needed — page_images already has an admin-write
 * policy and a free-form `page` string).
 */
export const HERO_VARIANT_PAGE = "home-hero-variant";

export type HeroVariant = "full-bleed" | "light-arch";
export const HERO_VARIANTS: { id: HeroVariant; label: string; description: string }[] = [
  {
    id: "full-bleed",
    label: "תמונה מלאה עם כיתוב עליה",
    description: "עיצוב נוכחי — תמונה ברקע כל הרוחב, כיתוב וכפתורים מעליה",
  },
  {
    id: "light-arch",
    label: "רקע בהיר עם קשת בצד",
    description: "עיצוב קודם — רקע ורוד-קרם בהיר, תמונה בקשת בצד",
  },
];

export function resolveHeroVariant(rows: PageImage[] | undefined): HeroVariant {
  const row = (rows ?? []).find((r) => r.source === "config");
  return row?.caption === "light-arch" ? "light-arch" : "full-bleed";
}

export async function saveHeroVariant(variant: HeroVariant) {
  const rows = await fetchPageImages(HERO_VARIANT_PAGE);
  const existing = rows.find((r) => r.source === "config");
  if (existing) {
    const { error } = await supabase
      .from("page_images")
      .update({ caption: variant })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("page_images").insert({
    page: HERO_VARIANT_PAGE,
    url: "",
    source: "config",
    caption: variant,
    hidden: true,
    sort_order: 9999,
  });
  if (error) throw error;
}

/** Client-side hook: which hero design the homepage should render. */
export function useHeroVariant() {
  const query = useQuery({
    queryKey: ["page-images", HERO_VARIANT_PAGE],
    queryFn: () => fetchPageImages(HERO_VARIANT_PAGE),
    staleTime: 60_000,
  });
  const resolved = query.data ? resolveHeroVariant(query.data) : undefined;
  const [cached] = useState<HeroVariant | null>(() => {
    const v = readConfigCache(HERO_VARIANT_PAGE);
    return v === "light-arch" || v === "full-bleed" ? v : null;
  });
  useEffect(() => {
    if (resolved) writeConfigCache(HERO_VARIANT_PAGE, resolved);
  }, [resolved]);
  return { ...query, variant: resolved ?? cached ?? "full-bleed" };
}

/**
 * Chat bot avatar — replaceable from /admin/gallery without a developer, per
 * explicit request. Same "config" row trick as saveAspect/saveHeroVariant
 * above, but the row's own `url`/`storage_path` hold the uploaded image
 * (not `caption`, since this is an actual picture, not a short setting
 * value). No row (or a deleted one) means "use the bundled default avatar".
 */
export const CHATBOT_AVATAR_PAGE = "chatbot-avatar";

export function resolveChatbotAvatarUrl(rows: PageImage[] | undefined): string | null {
  const row = (rows ?? []).find((r) => r.source === "config");
  return row?.url || null;
}

export async function saveChatbotAvatar(url: string, storagePath: string) {
  const rows = await fetchPageImages(CHATBOT_AVATAR_PAGE);
  const existing = rows.find((r) => r.source === "config");
  if (existing) {
    const { error } = await supabase
      .from("page_images")
      .update({ url, storage_path: storagePath })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("page_images").insert({
    page: CHATBOT_AVATAR_PAGE,
    url,
    storage_path: storagePath,
    source: "config",
    caption: null,
    hidden: true,
    sort_order: 9999,
  });
  if (error) throw error;
}

/** Deletes the config row (and its storage file) so the bundled default avatar takes over again. */
export async function resetChatbotAvatar() {
  const rows = await fetchPageImages(CHATBOT_AVATAR_PAGE);
  const existing = rows.find((r) => r.source === "config");
  if (!existing) return;
  const { error } = await supabase.from("page_images").delete().eq("id", existing.id);
  if (error) throw error;
  if (existing.storage_path) await supabase.storage.from("items").remove([existing.storage_path]);
}

/** Client-side hook: the chat bot's current avatar URL, or null for the bundled default. */
export function useChatbotAvatar() {
  const query = useQuery({
    queryKey: ["page-images", CHATBOT_AVATAR_PAGE],
    queryFn: () => fetchPageImages(CHATBOT_AVATAR_PAGE),
    staleTime: 60_000,
  });
  const resolved = query.data ? resolveChatbotAvatarUrl(query.data) : undefined;
  const [cached] = useState<string | null>(() => readConfigCache(CHATBOT_AVATAR_PAGE));
  useEffect(() => {
    if (resolved !== undefined) writeConfigCache(CHATBOT_AVATAR_PAGE, resolved);
  }, [resolved]);
  return { ...query, url: resolved !== undefined ? resolved : cached };
}

/**
 * Site icon ("the heart symbol") — replaceable from /admin/gallery without a
 * developer, per explicit request (this used to mean editing/rebuilding
 * favicon.ico by hand every time the owner wanted a different heart image).
 * Same config-row pattern as the chat bot avatar above. Swapped in on the
 * client after load (see DynamicFavicon in __root.tsx) rather than in the
 * server-rendered <head>, so the static /favicon.ico link always stays as
 * the safe fallback for the very first paint, crawlers, and browser tabs
 * that never run the swap.
 */
export const SITE_ICON_PAGE = "site-icon";

export function resolveSiteIconUrl(rows: PageImage[] | undefined): string | null {
  const row = (rows ?? []).find((r) => r.source === "config");
  return row?.url || null;
}

export async function saveSiteIcon(url: string, storagePath: string) {
  const rows = await fetchPageImages(SITE_ICON_PAGE);
  const existing = rows.find((r) => r.source === "config");
  if (existing) {
    const { error } = await supabase
      .from("page_images")
      .update({ url, storage_path: storagePath })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("page_images").insert({
    page: SITE_ICON_PAGE,
    url,
    storage_path: storagePath,
    source: "config",
    caption: null,
    hidden: true,
    sort_order: 9999,
  });
  if (error) throw error;
}

/** Deletes the config row (and its storage file) so the bundled favicon.ico takes over again. */
export async function resetSiteIcon() {
  const rows = await fetchPageImages(SITE_ICON_PAGE);
  const existing = rows.find((r) => r.source === "config");
  if (!existing) return;
  const { error } = await supabase.from("page_images").delete().eq("id", existing.id);
  if (error) throw error;
  if (existing.storage_path) await supabase.storage.from("items").remove([existing.storage_path]);
}

/** Client-side hook: the site's current custom icon URL, or null for the bundled favicon.ico. */
export function useSiteIcon() {
  const query = useQuery({
    queryKey: ["page-images", SITE_ICON_PAGE],
    queryFn: () => fetchPageImages(SITE_ICON_PAGE),
    staleTime: 60_000,
  });
  const resolved = query.data ? resolveSiteIconUrl(query.data) : undefined;
  const [cached] = useState<string | null>(() => readConfigCache(SITE_ICON_PAGE));
  useEffect(() => {
    if (resolved !== undefined) writeConfigCache(SITE_ICON_PAGE, resolved);
  }, [resolved]);
  return { ...query, url: resolved !== undefined ? resolved : cached };
}

/**
 * The heart image used inside order/booking emails (contract, "she
 * finished choosing", birth-basket interest, photos-ready, etc.) — per
 * explicit request, replaceable from /admin/gallery without a developer,
 * same config-row pattern as the chat bot avatar / site icon above. Kept as
 * its own separate setting (not reusing SITE_ICON_PAGE) since emails are
 * static HTML built server-side, not React — a plain resolver + <img> tag
 * builder below, not a hook, for use inside .functions.ts email builders.
 */
export const EMAIL_HEART_PAGE = "email-heart";

export function resolveEmailHeartUrl(rows: PageImage[] | undefined): string | null {
  const row = (rows ?? []).find((r) => r.source === "config");
  return row?.url || null;
}

export async function saveEmailHeart(url: string, storagePath: string) {
  const rows = await fetchPageImages(EMAIL_HEART_PAGE);
  const existing = rows.find((r) => r.source === "config");
  if (existing) {
    const { error } = await supabase
      .from("page_images")
      .update({ url, storage_path: storagePath })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("page_images").insert({
    page: EMAIL_HEART_PAGE,
    url,
    storage_path: storagePath,
    source: "config",
    caption: null,
    hidden: true,
    sort_order: 9999,
  });
  if (error) throw error;
}

/** Deletes the config row (and its storage file) so the bundled default heart takes over again. */
export async function resetEmailHeart() {
  const rows = await fetchPageImages(EMAIL_HEART_PAGE);
  const existing = rows.find((r) => r.source === "config");
  if (!existing) return;
  const { error } = await supabase.from("page_images").delete().eq("id", existing.id);
  if (error) throw error;
  if (existing.storage_path) await supabase.storage.from("items").remove([existing.storage_path]);
}

/** Client-side hook: the current admin-set email-heart URL, or null for the bundled default (used by the admin gallery tab). */
export function useEmailHeart() {
  const query = useQuery({
    queryKey: ["page-images", EMAIL_HEART_PAGE],
    queryFn: () => fetchPageImages(EMAIL_HEART_PAGE),
    staleTime: 60_000,
  });
  return { ...query, url: resolveEmailHeartUrl(query.data) };
}

/**
 * Server-side (no React) resolver used inside email HTML builders — always
 * hits the DB fresh (no request-scoped caching here: emails are sent rarely
 * enough per user action that a stale heart for one send isn't worth the
 * complexity). Returns a ready-to-splice <img> tag, sized to sit inline in
 * a sentence like the 💗 emoji it replaces; falls back to the bundled
 * default heart asset if she hasn't uploaded one via /admin/gallery yet.
 */
export async function emailHeartImgTag(sizePx = 16): Promise<string> {
  let url: string | null = null;
  try {
    const rows = await fetchPageImages(EMAIL_HEART_PAGE);
    url = resolveEmailHeartUrl(rows);
  } catch {
    // best-effort — fall back to the bundled default below
  }
  const src = url ?? DEFAULT_EMAIL_HEART_URL;
  return `<img src="${src}" alt="💗" width="${sizePx}" height="${sizePx}" style="display:inline-block;vertical-align:-${Math.round(sizePx * 0.12)}px;width:${sizePx}px;height:${sizePx}px" />`;
}

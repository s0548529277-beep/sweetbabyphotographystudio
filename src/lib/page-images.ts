import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PAGE_IMAGE_KEYS = {
  studioRental: "studio-rental",
  photographyStudio: "photography-studio",
  photographyOutdoor: "photography-outdoor",
} as const;

export type PageImageKey = (typeof PAGE_IMAGE_KEYS)[keyof typeof PAGE_IMAGE_KEYS];

export type PageImage = {
  id: string;
  page: string;
  url: string;
  storage_path: string | null;
  caption: string | null;
  sort_order: number;
  created_at: string;
};

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

/** Client-side hook: extra images managed from the admin panel for a given page. */
export function usePageImages(page: string) {
  return useQuery({
    queryKey: ["page-images", page],
    queryFn: () => fetchPageImages(page),
    staleTime: 60_000,
  });
}

import { studioInspiration } from "@/lib/inspiration";

/** Images that ship with the site (bundled assets) for a given page. Read-only in admin. */
export function builtinPageImages(page: string): string[] {
  if (page === PAGE_IMAGE_KEYS.studioRental) return studioInspiration();
  return [];
}

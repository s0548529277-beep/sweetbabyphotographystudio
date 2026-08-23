import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const BASE_URL = "https://sweetbabyphoto.shop";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const staticEntries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/rental-catalog", changefreq: "weekly", priority: "0.9" },
  { path: "/studio-photography", changefreq: "weekly", priority: "0.9" },
  { path: "/studio-rental", changefreq: "weekly", priority: "0.9" },
  { path: "/booking", changefreq: "weekly", priority: "0.8" },
  { path: "/track", changefreq: "weekly", priority: "0.8" },
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/contact", changefreq: "monthly", priority: "0.7" },
  { path: "/terms", changefreq: "monthly", priority: "0.7" },
  { path: "/blog", changefreq: "weekly", priority: "0.7" },
  { path: "/blog/essential-newborn-props", changefreq: "monthly", priority: "0.7" },
  { path: "/blog/chalakah-photoshoot-guide", changefreq: "monthly", priority: "0.7" },
];

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  const isNewKey = supabaseKey.startsWith("sb_publishable_") || supabaseKey.startsWith("sb_secret_");
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewKey && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [...staticEntries];

        try {
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (url && key) {
            const supabase = createClient<Database>(url, key, {
              global: { fetch: createSupabaseFetch(key) },
              auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
            });
            const { data: items } = await supabase
              .from("items")
              .select("id, sku, active")
              .eq("active", true)
              .limit(1000);
            (items ?? []).forEach((item) => {
              entries.push({
                path: `/items/${item.id}`,
                changefreq: "weekly",
                priority: "0.6",
              });
            });
          }
        } catch {
          // If the DB query fails, still serve the static sitemap.
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});

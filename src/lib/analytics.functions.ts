// Self-hosted site-analytics: session/pageview/click tracking (called from
// the public site, see site-tracking.tsx) and the admin-only summary read
// (see /admin/analytics). No Google account or API credentials involved —
// see the migration's own doc comment for why this was built in-house
// instead of wiring up a real GA4 property.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

/**
 * Buckets a visit into a coarse, admin-readable traffic source. Checked in
 * this order: UTM params on the landing URL first (an explicit tag beats a
 * guess from the referrer), then the referrer's own hostname, then "direct"
 * (no referrer at all — typed URL, bookmark, or most in-app browsers that
 * strip it). Unrecognized-but-present referrers fall to "other" rather than
 * being dropped, so a real external site sending traffic (a blog, a local
 * directory) still counts as *something* other than "direct".
 */
function classifySource(referrer: string, entryPath: string): string {
  const search = entryPath.includes("?") ? entryPath.slice(entryPath.indexOf("?")) : "";
  const utm = search.toLowerCase();
  if (utm.includes("utm_source=google") || utm.includes("gclid=")) return "google";
  if (utm.includes("utm_source=facebook") || utm.includes("utm_source=instagram") || utm.includes("utm_source=meta") || utm.includes("fbclid=")) return "meta";
  if (utm.includes("utm_source=whatsapp") || utm.includes("utm_source=wa")) return "whatsapp";
  if (utm.includes("utm_source=")) return "other";

  if (!referrer) return "direct";
  let host = "";
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (host.includes("google.")) return "google";
  if (host.includes("facebook.com") || host.includes("instagram.com") || host.includes("fb.com") || host.includes("l.facebook.com")) return "meta";
  if (host.includes("whatsapp.com") || host === "wa.me") return "whatsapp";
  if (host.includes("bing.com")) return "bing";
  if (host.includes("sweetbabyphoto.shop") || host.includes("localhost")) return "internal";
  return "other";
}

const sessionIdSchema = z.string().uuid();

/**
 * Fired once per browser session, on the very first pageview (see
 * site-tracking.tsx — it checks sessionStorage before calling this).
 * Insert-only via ignoreDuplicates: a retried/duplicate call for the same
 * session id is a silent no-op rather than resetting first_seen.
 */
export const startAnalyticsSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: sessionIdSchema,
        entryPath: z.string().min(1).max(500),
        referrer: z.string().max(1000).optional().default(""),
        userAgent: z.string().max(500).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const source = classifySource(data.referrer, data.entryPath);
      await (supabaseAdmin as any)
        .from("analytics_sessions")
        .upsert(
          {
            id: data.sessionId,
            entry_path: data.entryPath,
            referrer: data.referrer || null,
            source,
            user_agent: data.userAgent || null,
          },
          { onConflict: "id", ignoreDuplicates: true },
        );
    } catch (e) {
      // Analytics must never break the page it's measuring.
      console.error("[SWEETBABY] startAnalyticsSession failed", e);
    }
    return { ok: true };
  });

/** One row per navigation, plus nudges the session's last_seen forward. */
export const trackPageview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ sessionId: sessionIdSchema, path: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const now = new Date().toISOString();
      await Promise.all([
        (supabaseAdmin as any).from("analytics_events").insert({ session_id: data.sessionId, type: "pageview", path: data.path, created_at: now }),
        (supabaseAdmin as any).from("analytics_sessions").update({ last_seen: now }).eq("id", data.sessionId),
      ]);
    } catch (e) {
      console.error("[SWEETBABY] trackPageview failed", e);
    }
    return { ok: true };
  });

/**
 * Batched click log — the client accumulates clicks locally and flushes an
 * array every few seconds (see site-tracking.tsx) instead of one request
 * per click, so a page someone clicks around on a lot doesn't turn into a
 * request storm. Capped at 50 per call as a sanity limit, not a real one.
 */
export const trackClicks = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: sessionIdSchema,
        clicks: z.array(z.object({ path: z.string().min(1).max(500) })).min(1).max(50),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const now = new Date().toISOString();
      const rows = data.clicks.map((c) => ({ session_id: data.sessionId, type: "click" as const, path: c.path, created_at: now }));
      await Promise.all([
        (supabaseAdmin as any).from("analytics_events").insert(rows),
        (supabaseAdmin as any).from("analytics_sessions").update({ last_seen: now }).eq("id", data.sessionId),
      ]);
    } catch (e) {
      console.error("[SWEETBABY] trackClicks failed", e);
    }
    return { ok: true };
  });

/** Periodic "still here" ping while a tab stays open with no navigation/clicks, so time-on-site reflects someone reading a long page, not just their last interaction. */
export const trackHeartbeat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ sessionId: sessionIdSchema }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any).from("analytics_sessions").update({ last_seen: new Date().toISOString() }).eq("id", data.sessionId);
    } catch (e) {
      console.error("[SWEETBABY] trackHeartbeat failed", e);
    }
    return { ok: true };
  });

/**
 * Uploads the final flattened collage PNG (data URL, same rasterization
 * already used for the visitor's own download — see downloadCollagePng in
 * collage-maker.tsx) to the private "collages" bucket and logs it, so the
 * admin gallery can show what people are actually making. Only the
 * finished, flattened image — never the separate source photos someone
 * uploaded into it.
 */
export const saveCollageCreation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: sessionIdSchema,
        imageDataUrl: z.string().min(100).max(15_000_000),
        formatId: z.string().max(50).optional(),
        sizeId: z.string().max(50).optional(),
        styleId: z.string().max(50).optional(),
        photoCount: z.number().int().min(0).max(50).optional(),
        caption: z.string().max(200).optional(),
        subtitle: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const match = data.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
    if (!match) throw new Error("פורמט תמונה לא תקין");
    const [, mediaType, base64] = match;
    const ext = mediaType.split("/")[1]?.split("+")[0] ?? "png";
    const path = `${data.sessionId}/${Date.now()}.${ext}`;
    const bytes = Buffer.from(base64, "base64");
    const { error: upErr } = await supabaseAdmin.storage.from("collages").upload(path, bytes, { contentType: mediaType, upsert: true });
    if (upErr) throw new Error(upErr.message);

    const { error: insErr } = await (supabaseAdmin as any).from("collage_creations").insert({
      session_id: data.sessionId,
      storage_path: path,
      format_id: data.formatId ?? null,
      size_id: data.sizeId ?? null,
      style_id: data.styleId ?? null,
      photo_count: data.photoCount ?? null,
      caption: data.caption ?? null,
      subtitle: data.subtitle ?? null,
    });
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });

export type TrafficSourceRow = { source: string; sessions: number };
export type TopPageRow = { path: string; clicks: number; pageviews: number };
export type CollageRow = {
  id: string;
  imageUrl: string;
  formatId: string | null;
  sizeId: string | null;
  styleId: string | null;
  photoCount: number | null;
  caption: string | null;
  subtitle: string | null;
  createdAt: string;
};
export type AnalyticsSummary = {
  rangeDays: number;
  totalSessions: number;
  totalPageviews: number;
  totalClicks: number;
  avgSessionSeconds: number;
  trafficSources: TrafficSourceRow[];
  topPages: TopPageRow[];
  sessionsByDay: { day: string; sessions: number }[];
  collages: CollageRow[];
};

/**
 * The admin page's one data source. Reads with the service-role client
 * (needed anyway to mint signed URLs for the private collages bucket) only
 * after verifying the caller is a real admin via the authenticated
 * request context — same two-step pattern as every other admin.*
 * function in this codebase (see adminSetStatus in admin-orders.functions.ts).
 */
export const getAnalyticsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(d))
  .handler(async ({ data, context }): Promise<AnalyticsSummary> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();

    const [sessionsRes, eventsRes, collagesRes] = await Promise.all([
      (supabaseAdmin as any).from("analytics_sessions").select("id, first_seen, last_seen, source").gte("first_seen", since),
      (supabaseAdmin as any).from("analytics_events").select("type, path, created_at").gte("created_at", since).limit(50_000),
      (supabaseAdmin as any)
        .from("collage_creations")
        .select("id, storage_path, format_id, size_id, style_id, photo_count, caption, subtitle, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(60),
    ]);
    if (sessionsRes.error) throw new Error(sessionsRes.error.message);
    if (eventsRes.error) throw new Error(eventsRes.error.message);
    if (collagesRes.error) throw new Error(collagesRes.error.message);

    const sessions = sessionsRes.data ?? [];
    const events = eventsRes.data ?? [];
    const collages = (collagesRes.data ?? []) as any[];

    const totalSessions = sessions.length;
    let totalDurationMs = 0;
    const bySourceCount = new Map<string, number>();
    const byDayCount = new Map<string, number>();
    for (const s of sessions) {
      const dur = new Date(s.last_seen).getTime() - new Date(s.first_seen).getTime();
      if (dur > 0) totalDurationMs += dur;
      bySourceCount.set(s.source, (bySourceCount.get(s.source) ?? 0) + 1);
      const day = String(s.first_seen).slice(0, 10);
      byDayCount.set(day, (byDayCount.get(day) ?? 0) + 1);
    }
    const avgSessionSeconds = totalSessions > 0 ? Math.round(totalDurationMs / totalSessions / 1000) : 0;

    const clicksByPath = new Map<string, number>();
    const viewsByPath = new Map<string, number>();
    let totalPageviews = 0;
    let totalClicks = 0;
    for (const e of events) {
      if (e.type === "click") {
        clicksByPath.set(e.path, (clicksByPath.get(e.path) ?? 0) + 1);
        totalClicks++;
      } else {
        viewsByPath.set(e.path, (viewsByPath.get(e.path) ?? 0) + 1);
        totalPageviews++;
      }
    }
    const allPaths = new Set([...clicksByPath.keys(), ...viewsByPath.keys()]);
    const topPages: TopPageRow[] = Array.from(allPaths)
      .map((path) => ({ path, clicks: clicksByPath.get(path) ?? 0, pageviews: viewsByPath.get(path) ?? 0 }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 20);

    const trafficSources: TrafficSourceRow[] = Array.from(bySourceCount.entries())
      .map(([source, count]) => ({ source, sessions: count }))
      .sort((a, b) => b.sessions - a.sessions);

    const sessionsByDay = Array.from(byDayCount.entries())
      .map(([day, count]) => ({ day, sessions: count }))
      .sort((a, b) => a.day.localeCompare(b.day));

    const collageRows: CollageRow[] = [];
    for (const c of collages) {
      const { data: signed } = await supabaseAdmin.storage.from("collages").createSignedUrl(c.storage_path, 60 * 60);
      if (!signed?.signedUrl) continue;
      collageRows.push({
        id: c.id,
        imageUrl: signed.signedUrl,
        formatId: c.format_id,
        sizeId: c.size_id,
        styleId: c.style_id,
        photoCount: c.photo_count,
        caption: c.caption,
        subtitle: c.subtitle,
        createdAt: c.created_at,
      });
    }

    return {
      rangeDays: data.days,
      totalSessions,
      totalPageviews,
      totalClicks,
      avgSessionSeconds,
      trafficSources,
      topPages,
      sessionsByDay,
      collages: collageRows,
    };
  });

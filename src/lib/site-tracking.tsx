// Client side of the in-house analytics system (see analytics.functions.ts
// and /admin/analytics for the rest). Mounted once in __root.tsx, next to
// <Analytics /> (GA4/Meta Pixel, still separate and still opt-in via env
// var) — this one always runs, no configuration needed, and writes into
// our own Supabase tables instead of a third party.
import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

const SESSION_KEY = "sb_session_id";
const HEARTBEAT_MS = 20_000;
const CLICK_FLUSH_MS = 8_000;

/** Reads the current tab's analytics session id, if one exists yet — used by /collage-maker to tag a saved collage with the session that made it. Never creates one (SiteTracking always mounts first, at the root), so this can come back null very briefly before that effect runs. */
export function getSiteSessionId(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function getOrCreateSessionId(): { id: string; isNew: boolean } {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return { id: existing, isNew: false };
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return { id, isNew: true };
  } catch {
    // sessionStorage unavailable (private mode edge cases) — fall back to
    // a one-off id that just won't persist across a reload on this tab.
    return { id: crypto.randomUUID(), isNew: true };
  }
}

// Renders nothing. Tracks: one session per tab (sessionStorage-scoped),
// one pageview per navigation, batched click counts per page, and a
// heartbeat that keeps last_seen moving forward while the tab stays open
// so "time on site" reflects someone actually reading, not just clicking.
export function SiteTracking() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search });
  const sessionIdRef = useRef<string | null>(null);
  const pendingClicksRef = useRef<{ path: string }[]>([]);
  // Every write that references session_id (pageview/click/heartbeat) has
  // an FK into analytics_sessions — waits on this so the very first
  // pageview of a brand-new tab can't reach the DB before the session row
  // it points at exists. Already-resolved for a returning tab (isNew
  // false), so this adds no delay after the first pageview of a session.
  const sessionReadyRef = useRef<Promise<void>>(Promise.resolve());

  // Session start — once per tab.
  useEffect(() => {
    const { id, isNew } = getOrCreateSessionId();
    sessionIdRef.current = id;
    if (!isNew) return;
    const searchStr = typeof search === "string" ? search : new URLSearchParams(search as any).toString();
    const entryPath = pathname + (searchStr ? `?${searchStr}` : "");
    sessionReadyRef.current = import("@/lib/analytics.functions")
      .then(({ startAnalyticsSession }) =>
        startAnalyticsSession({ data: { sessionId: id, entryPath, referrer: document.referrer, userAgent: navigator.userAgent } }),
      )
      .then(() => {}, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pageview per navigation (including the first render) — queued behind
  // sessionReadyRef so it never races the session row's own insert.
  useEffect(() => {
    const id = sessionIdRef.current;
    if (!id) return;
    sessionReadyRef.current.then(() =>
      import("@/lib/analytics.functions").then(({ trackPageview }) => trackPageview({ data: { sessionId: id, path: pathname } }).catch(() => {})),
    );
  }, [pathname]);

  // Click batching — accumulate locally, flush periodically and on
  // navigation/hide instead of one request per click.
  useEffect(() => {
    const flush = () => {
      const id = sessionIdRef.current;
      const clicks = pendingClicksRef.current;
      if (!id || clicks.length === 0) return;
      pendingClicksRef.current = [];
      sessionReadyRef.current.then(() =>
        import("@/lib/analytics.functions").then(({ trackClicks }) => trackClicks({ data: { sessionId: id, clicks } }).catch(() => {})),
      );
    };
    const onClick = () => {
      pendingClicksRef.current.push({ path: window.location.pathname });
    };
    document.addEventListener("click", onClick, { capture: true, passive: true });
    const interval = setInterval(flush, CLICK_FLUSH_MS);
    const onHide = () => flush();
    const onVisibilityChange = () => document.visibilityState === "hidden" && onHide();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // Heartbeat — keeps last_seen moving while the tab is open and visible,
  // even if the visitor isn't clicking or navigating (e.g. reading a long
  // page). Skips while hidden so a backgrounded tab doesn't inflate duration.
  useEffect(() => {
    const tick = () => {
      const id = sessionIdRef.current;
      if (!id || document.visibilityState !== "visible") return;
      sessionReadyRef.current.then(() =>
        import("@/lib/analytics.functions").then(({ trackHeartbeat }) => trackHeartbeat({ data: { sessionId: id } }).catch(() => {})),
      );
    };
    const interval = setInterval(tick, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
}

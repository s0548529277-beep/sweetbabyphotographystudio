import { useEffect } from "react";

// Both IDs are public by nature (they end up visible in every rendered
// page anyway), so they're read from plain VITE_* env vars like the rest
// of this app's client config — not secrets. Leave them unset in `.env`
// to keep analytics off entirely.
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;

declare global {
  interface Window {
    dataLayer?: unknown[];
    fbq?: ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string };
  }
}

function loadGoogleAnalytics(id: string) {
  if (document.getElementById("ga4-script")) return;
  const script = document.createElement("script");
  script.id = "ga4-script";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  const gtag = (...args: unknown[]) => window.dataLayer!.push(args);
  gtag("js", new Date());
  gtag("config", id);
}

function loadMetaPixel(id: string) {
  if (window.fbq) return;
  const fbq: Window["fbq"] = (...args: unknown[]) => {
    if (fbq.callMethod) (fbq.callMethod as (...a: unknown[]) => void)(...args);
    else fbq.queue!.push(args);
  };
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  window.fbq = fbq;

  const script = document.createElement("script");
  script.id = "meta-pixel-script";
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  window.fbq("init", id);
  window.fbq("track", "PageView");
}

// Renders nothing — only loads GA4 / Meta Pixel when the corresponding
// env var is configured, so the site stays tracker-free until someone
// fills in VITE_GA_MEASUREMENT_ID / VITE_META_PIXEL_ID.
export function Analytics() {
  useEffect(() => {
    if (GA_MEASUREMENT_ID) loadGoogleAnalytics(GA_MEASUREMENT_ID);
    if (META_PIXEL_ID) loadMetaPixel(META_PIXEL_ID);
  }, []);

  return null;
}

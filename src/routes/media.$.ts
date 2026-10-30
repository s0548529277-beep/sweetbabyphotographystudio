import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Same-domain image proxy for client galleries — see src/lib/media-url.ts
// for why (NetFree/Netiv/Etrog block the storage host, not this site).
//
// /media/public/<bucket>/<path>          → storage public object
// /media/sign/<bucket>/<path>?token=...  → storage signed object
//
// Adds no privileges: it only forwards the caller's own path + signed token
// to the storage endpoint, never a service key, so anything it returns was
// already reachable at the original storage URL.
export const Route = createFileRoute("/media/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const splat = String((params as { _splat?: string })._splat ?? "");
        if (!/^(public|sign)\/[^?#]+$/.test(splat) || splat.split("/").some((s) => s === ".." || s === "")) {
          return new Response("Not found", { status: 404 });
        }
        const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
        if (!base) return new Response("Storage not configured", { status: 500 });

        const incoming = new URL(request.url);
        const target = new URL(`${base}/storage/v1/object/${splat}`);
        const token = incoming.searchParams.get("token");
        if (token) target.searchParams.set("token", token);

        const upstream = await fetch(target.toString(), {
          headers: request.headers.get("range") ? { range: request.headers.get("range")! } : undefined,
        });
        if (!upstream.ok && upstream.status !== 206) {
          return new Response("Not found", { status: upstream.status === 400 ? 404 : upstream.status });
        }

        const headers = new Headers();
        for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
          const v = upstream.headers.get(h);
          if (v) headers.set(h, v);
        }
        // Gallery files use random UUID names and are never overwritten, so
        // browsers may cache them; "private" keeps signed photos out of
        // shared caches.
        headers.set("cache-control", "private, max-age=604800");
        headers.set("x-content-type-options", "nosniff");
        return new Response(upstream.body, { status: upstream.status, headers });
      },
    },
  },
});

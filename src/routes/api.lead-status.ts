import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// One-click lead stage from the hourly digest mail. GET with a signed token (see lead-status.server.ts).
// Answers a small RTL page that says what was set and offers an undo link back to the previous stage.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>
<body style="font-family:Arial,sans-serif;background:#faf7f4;color:#2d3d2b;margin:0;padding:32px 16px"><div style="max-width:440px;margin:auto;background:#fff;border-radius:16px;padding:24px;text-align:center;line-height:1.7">${body}</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

export const Route = createFileRoute("/api/lead-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const u = new URL(request.url);
          const id = u.searchParams.get("id") ?? "";
          const status = u.searchParams.get("s") ?? "";
          const token = u.searchParams.get("t") ?? "";
          const { verifyLeadStatusToken, leadStatusUrl } = await import("@/lib/lead-status.server");
          const { leadStageLabel } = await import("@/lib/lead-status");
          if (!UUID_RE.test(id) || !(await verifyLeadStatusToken(id, status, token))) {
            return page("קישור לא תקין", "<h2>הקישור לא תקין</h2><p>אפשר לשנות את השלב במסך הלידים באתר.</p>", 400);
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as any;
          const { data: lead } = await db.from("inquiry_leads").select("id, name, status").eq("id", id).maybeSingle();
          if (!lead) return page("לא נמצא", "<h2>הליד לא נמצא</h2>", 404);
          const prev: string = lead.status;
          const now = new Date().toISOString();
          const patch: Record<string, unknown> = { status, updated_at: now };
          if (status === "replied" || status === "in_talk") patch.last_contact_at = now;
          const { error } = await db.from("inquiry_leads").update(patch).eq("id", id);
          if (error) throw error;
          const undo = prev && prev !== status ? `<p style="margin-top:18px"><a href="${esc(await leadStatusUrl(id, prev))}" style="color:#7a5a44">טעות? להחזיר ל"${esc(leadStageLabel(prev))}"</a></p>` : "";
          return page(
            "השלב עודכן",
            `<h2 style="margin:0 0 6px">✓ עודכן</h2><p><b>${esc(lead.name || "הליד")}</b> סומנה: <b>${esc(leadStageLabel(status))}</b></p>${undo}<p style="margin-top:14px"><a href="https://sweetbabyphoto.shop/admin/leads" style="color:#2d3d2b">למסך הלידים</a></p>`,
          );
        } catch (e) {
          console.error("[SWEETBABY] lead-status failed", e);
          return page("תקלה", "<h2>משהו השתבש</h2><p>אפשר לשנות את השלב במסך הלידים באתר.</p>", 500);
        }
      },
    },
  },
});

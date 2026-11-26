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
          const { leadStageLabel, tomorrowMorningIso } = await import("@/lib/lead-status");
          if (!UUID_RE.test(id) || !(await verifyLeadStatusToken(id, status, token))) {
            return page("קישור לא תקין", "<h2>הקישור לא תקין</h2><p>אפשר לשנות את השלב במסך הלידים באתר.</p>", 400);
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as any;
          const { data: lead } = await db.from("inquiry_leads").select("id, name, phone, email, status").eq("id", id).maybeSingle();
          if (!lead) return page("לא נמצא", "<h2>הליד לא נמצא</h2>", 404);
          const who = esc(lead.name || "הליד");

          // "שנה סטטוס": a read-only page with the choices (every choice is its own signed link).
          if (status === "menu") {
            const opt = async (key: string, label: string, hint: string, bg: string, fg: string) =>
              `<a href="${esc(await leadStatusUrl(id, key))}" style="display:block;margin:10px 0;padding:12px 16px;border-radius:14px;background:${bg};color:${fg};text-decoration:none;font-weight:700">${label}<span style="display:block;font-weight:400;font-size:12px;margin-top:2px">${hint}</span></a>`;
            const contact = [lead.phone ? `<span dir="ltr">${esc(lead.phone)}</span>` : "", lead.email ? `<span dir="ltr">${esc(lead.email)}</span>` : ""].filter(Boolean).join(" · ");
            return page(
              "שינוי סטטוס",
              `<h2 style="margin:0 0 4px">${who}</h2><p style="margin:0 0 14px;color:#6b8a63;font-size:14px">${contact}<br>עכשיו: ${esc(leadStageLabel(lead.status))}</p>` +
                (await opt("remind_tomorrow", "⏰ תזכירי לי מחר", "היא תחזור לסיכום מחר בבוקר", "#fef3c7", "#92400e")) +
                (await opt("customer", "✅ כבר לקוחה — לפתוח כרטיס לקוח", "מסמנת כסגרה ופותחת כרטיס לקוח בניהול הלקוחות", "#d1fae5", "#065f46")) +
                (await opt("in_talk", "💬 בשיחה", "יוצאת מהסיכום", "#ede9fe", "#5b21b6")) +
                (await opt("replied", "✉️ נענתה", "יוצאת מהסיכום, ותחזור אם תשתוק 3 ימים", "#e0f2fe", "#075985")) +
                (await opt("not_relevant", "🚫 לא רלוונטי", "יוצאת מהסיכום", "#e7e5e4", "#57534e")),
            );
          }

          const prev: string = lead.status;
          const now = new Date().toISOString();
          const isRemind = status === "remind_tomorrow";
          const isCustomer = status === "customer";
          const newStage = isRemind ? "follow_up" : isCustomer ? "booked" : status;
          // remind_at only lives while the lead waits for its reminder; any other stage clears it.
          const patch: Record<string, unknown> = { status: newStage, updated_at: now, remind_at: isRemind ? tomorrowMorningIso() : null };
          if (newStage === "replied" || newStage === "in_talk" || isCustomer) patch.last_contact_at = now;
          const { error } = await db.from("inquiry_leads").update(patch).eq("id", id);
          if (error) throw error;
          const undo = prev && prev !== newStage ? `<p style="margin-top:18px"><a href="${esc(await leadStatusUrl(id, prev))}" style="color:#7a5a44">טעות? להחזיר ל"${esc(leadStageLabel(prev))}"</a></p>` : "";
          const label = isRemind ? "תזכורת למחר בבוקר ⏰" : isCustomer ? "כבר לקוחה ✅" : leadStageLabel(status);
          const next = isCustomer
            ? `<p style="margin-top:14px"><a href="https://sweetbabyphoto.shop/admin/newborn-packages?fromLead=${encodeURIComponent(id)}" style="display:inline-block;padding:10px 20px;border-radius:999px;background:#2d3d2b;color:#fff;text-decoration:none;font-weight:700">פתיחת כרטיס לקוח</a></p><p style="font-size:12px;color:#6b8a63;margin-top:6px">נפתח בניהול הלקוחות עם הפרטים שלה כבר מולאו (נדרשת התחברות לניהול).</p>`
            : "";
          return page(
            "השלב עודכן",
            `<h2 style="margin:0 0 6px">✓ עודכן</h2><p><b>${who}</b> סומנה: <b>${label}</b></p>${next}${undo}<p style="margin-top:14px"><a href="https://sweetbabyphoto.shop/admin/leads" style="color:#2d3d2b">למסך הלידים</a></p>`,
          );
        } catch (e) {
          console.error("[SWEETBABY] lead-status failed", e);
          return page("תקלה", "<h2>משהו השתבש</h2><p>אפשר לשנות את השלב במסך הלידים באתר.</p>", 500);
        }
      },
    },
  },
});

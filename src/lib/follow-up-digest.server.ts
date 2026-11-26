// Hourly "who to get back to, and why" summary mail for the owner (owner request 2026-11-05).
// Collects everything that is waiting for a human answer from the places leads arrive:
//   - phone: voice-bot "leave a message" notifications (admin_notifications.voice_message)
//   - phone/site: "photography with Michal" requests (admin_notifications.photography_request)
//   (anonymous site-chat conversations are NOT listed: no contact details, nothing to act on — owner request 2026-11-13)
//   - mail + manual: inquiry_leads (the e-mail assistant files e-mail inquiries there) that nobody answered
//   - funnel leads marked hot, booking drafts abandoned mid-way, studio bookings whose deposit is unpaid
// People are merged by phone/e-mail so one person = one line with all her reasons. Every person with contact details gets one-click
// two buttons (לא רלוונטי / שנה סטטוס): the digest links her to her `inquiry_leads` row or opens one. Sent at most once per
// hour, only inside the sending window (Israel time, not Shabbat), and only when something is waiting.
// Only leads of the last LEAD_WINDOW_DAYS days are listed (owner request 2026-11-26), the owner's own and her husband's test
// contacts are never listed, and under every person there are two buttons — "לא רלוונטי" and "שנה סטטוס" (remind tomorrow /
// already a customer / in talk / answered) — instead of the WhatsApp link.
// Called by the external scheduler through /api/send-booking-reminders.

import { isOwnerTestContact } from "@/lib/lead-exclusions";
import { BUTTON_ROW_NOTE, leadStatusButtonsHtml } from "@/lib/lead-status.server";

const DIGEST_TO = "m0548529277@gmail.com";
const STATE_KEY = "follow_up_digest_state";
// Owner, 2026-11-26: ONE summary a day at 20:00 (no hourly mail): people waiting 3+ days for an answer + ready drafts.
const MIN_GAP_MS = 20 * 3600_000;
const WAITING_DAYS = 3;
const SITE = "https://sweetbabyphoto.shop";
// Written into the notes of an `inquiry_leads` row that the digest itself opened for a person who came from another source
// (phone message, photography request, funnel, abandoned booking, unpaid deposit) so the stage buttons work for her too.
const DIGEST_NOTE = "נוצר מהסיכום השעתי";
/** How far back a lead may be and still be listed (the owner asked for "the last week or two"). */
export const LEAD_WINDOW_DAYS = 10;

type Reason = { id?: string; weight: number; icon: string; text: string; at: string | null; remind?: boolean; leadId?: string };
type Person = { key: string; name: string; phone: string; email: string; reasons: Reason[]; sourceKind: string; firstAt: string | null };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const clipRaw = (s: unknown, n: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

const clip = (s: unknown, n: number) => esc(clipRaw(s, n));

function israelNow() {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

/** 07:30–23:30 Israel time, not on Shabbat (Friday after 14:00 through Saturday). */
function windowOpen(): boolean {
  const { weekday, hour, minute } = israelNow();
  if (weekday === "Sat" || (weekday === "Fri" && hour >= 14)) return false;
  const mins = hour * 60 + minute;
  return mins >= 20 * 60 && mins <= 23 * 60 + 30;
}

function ageHe(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - Date.parse(iso);
  if (!isFinite(ms) || ms < 0) return "";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `לפני ${Math.max(1, m)} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return `לפני ${h} ${h === 1 ? "שעה" : "שעות"}`;
  const d = Math.round(h / 24);
  return `לפני ${d} ${d === 1 ? "יום" : "ימים"}`;
}

const digits = (p: unknown) => String(p ?? "").replace(/\D/g, "");
function phoneKey(p: unknown): string {
  const d = digits(p);
  return d.length >= 9 ? d.slice(-9) : "";
}
type DigestState = { at: string | null; ids: string[]; threadId: string | null; msgId: string | null; day: string | null };

async function loadState(db: any): Promise<DigestState> {
  const { data } = await db.from("app_settings").select("value").eq("key", STATE_KEY).maybeSingle();
  try {
    const v = JSON.parse(data?.value || "{}");
    return { at: v.at ?? null, ids: Array.isArray(v.ids) ? v.ids : [], threadId: v.threadId ?? null, msgId: v.msgId ?? null, day: v.day ?? null };
  } catch {
    return { at: null, ids: [], threadId: null, msgId: null, day: null };
  }
}

export async function collectFollowUps(db: any): Promise<Person[]> {
  const people = new Map<string, Person>();
  const add = (p: { id: string; name?: string | null; phone?: string | null; email?: string | null }, r: Reason, kind = "other") => {
    // The owner and her husband try the site's forms and quizzes — never a lead.
    if (isOwnerTestContact(p)) return;
    const pk = phoneKey(p.phone);
    const ek = String(p.email ?? "").trim().toLowerCase();
    // Merge by phone first, then e-mail; otherwise the source row is its own person.
    const key = pk ? `p:${pk}` : ek ? `e:${ek}` : `id:${p.id}`;
    const cur = people.get(key) ?? { key, name: "", phone: "", email: "", reasons: [], sourceKind: kind, firstAt: null };
    // The strongest reason decides which source the lead row gets when the digest opens one for her.
    if (r.weight > Math.max(0, ...cur.reasons.map((x) => x.weight))) cur.sourceKind = kind;
    if (r.at && (!cur.firstAt || Date.parse(r.at) < Date.parse(cur.firstAt))) cur.firstAt = r.at;
    if (!cur.name && p.name) cur.name = String(p.name).trim();
    if (!cur.phone && p.phone) cur.phone = String(p.phone).trim();
    if (!cur.email && ek) cur.email = ek;
    // Hot leads that stay unanswered come back once a day ("still waiting"): the day number joins the id, so the
    // reason counts as new in each daily digest, for at most 7 days.
    const ageDays = r.remind && r.at ? Math.floor((Date.now() - Date.parse(r.at)) / 86_400_000) : 0;
    if (r.remind && ageDays > 7) return;
    const bucket = ageDays >= 1 ? `:d${ageDays}` : "";
    cur.reasons.push({ ...r, text: ageDays >= 1 ? `⏰ עדיין מחכה (${ageDays === 1 ? "יום" : `${ageDays} ימים`}) — ${r.text}` : r.text, id: `${r.icon}:${p.id}:${r.at ?? ""}${bucket}` });
    people.set(key, cur);
  };

  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const leadSince = iso(now - LEAD_WINDOW_DAYS * 86_400_000);
  const safe = async (fn: () => Promise<void>, name: string) => {
    try {
      await fn();
    } catch (e) {
      console.error(`[SWEETBABY] follow-up digest source ${name} failed`, e);
    }
  };

  // Unread notifications: phone messages, photography requests, chat with real intent.
  await safe(async () => {
    const { data } = await db
      .from("admin_notifications")
      .select("id, type, title, body, created_at")
      .in("type", ["voice_message", "photography_request"])
      .is("read_at", null)
      .gte("created_at", iso(now - 3 * 86_400_000))
      .order("created_at", { ascending: false })
      .limit(300);
    for (const n of data ?? []) {
      const b = (n.body ?? {}) as any;
      if (n.type === "voice_message") {
        add(
          { id: n.id, name: b.contact_name, phone: b.phone },
          { weight: 80, icon: "📞", text: `השאירה הודעה בטלפון: "${clip(b.message, 160)}"${b.context ? ` (${clip(b.context, 60)})` : ""}`, at: n.created_at },
          "phone",
        );
      } else if (n.type === "photography_request") {
        const name = String(n.title ?? "").split("·").pop()?.trim() || null;
        add(
          { id: n.id, name, phone: b.phone, email: b.email },
          { weight: 90, icon: "📷", text: `ביקשה צילומים עם מיכל${b.session_type ? ` (${esc(b.session_type)})` : ""}${b.date ? ` ל-${esc(b.date)}${b.start_time ? ` ${esc(b.start_time)}` : ""}` : ""}${b.price ? ` · ₪${esc(b.price)}` : ""}`, at: n.created_at },
          "photography_request",
        );
      }
    }
  }, "notifications");

  // E-mail / manual inquiries nobody answered (the e-mail assistant files inbound mail into inquiry_leads).
  await safe(async () => {
    const { data } = await db
      .from("inquiry_leads")
      .select("id, name, email, phone, topic, message, status, first_contact_at, last_contact_at, follow_up_sent_at, source, notes, remind_at")
      .in("status", ["new", "replied", "follow_up"])
      // 60 days back only so a lead she parked with "תזכירי לי" can still come back; every other stage is cut to the window below.
      .gte("first_contact_at", iso(now - 60 * 86_400_000))
      .limit(400);
    for (const l of data ?? []) {
      const first = Date.parse(l.first_contact_at);
      const last = Date.parse(l.last_contact_at ?? l.first_contact_at);
      const remindAt = l.status === "follow_up" && l.remind_at ? Date.parse(l.remind_at) : NaN;
      // Outside the window only a lead she asked to be reminded about (and whose time came) is still listed.
      if (first < now - LEAD_WINDOW_DAYS * 86_400_000 && !(isFinite(remindAt) && remindAt <= now)) continue;
      // A row the digest (or a lead mail) opened itself is still "new" while the original reason (phone message, funnel…) is listed: do not list it twice.
      if (l.status === "new" && (String(l.notes ?? "").includes(DIGEST_NOTE) || String(l.notes ?? "").includes(BUTTON_ROW_NOTE))) continue;
      const src = esc(l.source === "email" || l.source === "gmail" ? "מייל" : l.source === "phone" ? "טלפון" : l.source || "פנייה");
      if (l.status === "new" && /🔥/.test(String(l.message ?? ""))) {
        // Hot lead from the photographer site's quiz (filed by the e-mail assistant): listed at once, then daily while unanswered.
        add({ id: l.id, name: l.name, phone: l.phone, email: l.email }, { leadId: l.id, weight: 78, remind: true, icon: "🔥", text: `ליד חם משאלון אתר הצלמת: "${clip(String(l.message).replace(/^🔥 ליד חם · /, ""), 120)}"`, at: l.first_contact_at });
      } else if (l.status === "new" && now - first > 60 * 60_000) {
        add({ id: l.id, name: l.name, phone: l.phone, email: l.email }, { leadId: l.id, weight: 70, icon: "✉️", text: `פנייה (${src}) שעוד לא נענתה: "${clip(l.message, 140)}"`, at: l.first_contact_at });
      } else if (l.status === "follow_up" && isFinite(remindAt)) {
        // She asked "תזכירי לי": silent until the time comes, then listed once.
        if (remindAt <= now) add({ id: l.id, name: l.name, phone: l.phone, email: l.email }, { leadId: l.id, weight: 85, icon: "⏰", text: `ביקשת תזכורת לחזור אליה: "${clip(l.message, 120)}"`, at: l.remind_at });
      } else if (l.status === "follow_up") {
        add({ id: l.id, name: l.name, phone: l.phone, email: l.email }, { leadId: l.id, weight: 60, icon: "🔁", text: `סומנה "לחזור אליה": "${clip(l.message, 120)}"`, at: l.last_contact_at ?? l.first_contact_at });
      } else if (l.status === "replied" && !l.follow_up_sent_at && now - last > 3 * 86_400_000) {
        add({ id: l.id, name: l.name, phone: l.phone, email: l.email }, { leadId: l.id, weight: 50, icon: "⏳", text: `ענית לה ושותקת 3+ ימים — כדאי מעקב: "${clip(l.message, 100)}"`, at: l.last_contact_at ?? l.first_contact_at });
      }
    }
  }, "inquiry_leads");

  await safe(async () => {
    const { data } = await db
      .from("funnel_leads")
      .select("id, name, phone, email, funnel, recommendation, created_at")
      .eq("is_hot", true)
      .is("handled_at", null)
      .gte("created_at", iso(now - 7 * 86_400_000))
      .limit(100);
    for (const l of data ?? []) {
      add({ id: l.id, name: l.name, phone: l.phone, email: l.email }, { weight: 75, remind: true, icon: "🔥", text: `ליד חם מהשאלון${l.funnel ? ` (${esc(l.funnel)})` : ""}${l.recommendation ? `: ${clip(l.recommendation, 80)}` : ""}`, at: l.created_at }, "funnel");
    }
  }, "funnel_leads");

  await safe(async () => {
    const { data } = await db
      .from("booking_drafts")
      .select("client_key, name, phone, email, step, updated_at")
      .eq("completed", false)
      .eq("handled", false)
      .gte("updated_at", iso(now - 2 * 86_400_000))
      .lte("updated_at", iso(now - 30 * 60_000))
      .limit(60);
    for (const d of data ?? []) {
      if (!d.phone && !d.email) continue;
      add({ id: d.client_key, name: d.name, phone: d.phone, email: d.email }, { weight: 55, icon: "🛒", text: `התחילה הזמנה ולא סיימה${d.step ? ` (נעצרה בשלב ${esc(d.step)})` : ""}`, at: d.updated_at }, "booking_draft");
    }
  }, "booking_drafts");

  await safe(async () => {
    const { data } = await db
      .from("bookings")
      .select("id, contact_name, contact_phone, contact_email, session_date, start_time, price, created_at")
      .eq("deposit_status", "pending")
      .neq("status", "cancelled")
      .gte("session_date", today)
      .gte("created_at", leadSince)
      .lte("created_at", iso(now - 60 * 60_000))
      .limit(60);
    for (const b of data ?? []) {
      const [y, m, d] = String(b.session_date).split("-");
      add(
        { id: b.id, name: b.contact_name, phone: b.contact_phone, email: b.contact_email },
        { weight: b.session_date === today ? 100 : 65, icon: "💳", text: `שריון סטודיו ל-${d}/${m} ${String(b.start_time ?? "").slice(0, 5)} — המקדמה עוד לא שולמה`, at: b.created_at },
        "booking",
      );
    }
  }, "bookings");

  // Customer edit requests (studio within 24h / props price change) that nobody approved or rejected for over an hour.
  await safe(async () => {
    const { data } = await db
      .from("order_edit_requests")
      .select("id, kind, target_id, original, reason, created_at")
      .eq("status", "pending")
      .lte("created_at", iso(now - 60 * 60_000))
      .gte("created_at", iso(now - 7 * 86_400_000))
      .limit(40);
    for (const r of data ?? []) {
      const o = r.original ?? {};
      add(
        { id: r.id, name: o.contact_name, phone: o.contact_phone, email: o.contact_email },
        { weight: 88, icon: "✏️", text: `בקשת עריכת ${r.kind === "booking" ? "שריון סטודיו" : "הזמנת אביזרים"} מחכה לאישור שלך (${clip(r.reason ?? "", 80)}) — ב-/admin/orders`, at: r.created_at },
      );
    }
  }, "order_edit_requests");

  // Link every person to her existing lead row (by phone or e-mail) so the stage buttons can be shown for any source, and
  // honour the stage she already set: a phone message / photography request / funnel lead / abandoned booking that is older
  // than the moment she marked the lead answered, in talk, closed or not relevant is no longer waiting.
  // Unpaid deposits and edit requests are operational, so a lead stage never hides them.
  await safe(async () => {
    const { data } = await db
      .from("inquiry_leads")
      .select("id, email, phone, status, updated_at, remind_at")
      .gte("created_at", iso(now - 120 * 86_400_000))
      .order("updated_at", { ascending: false })
      .limit(1000);
    const byPhone = new Map<string, any>();
    const byEmail = new Map<string, any>();
    for (const l of data ?? []) {
      const pk = phoneKey(l.phone);
      const ek = String(l.email ?? "").trim().toLowerCase();
      if (pk && !byPhone.has(pk)) byPhone.set(pk, l);
      if (ek && !byEmail.has(ek)) byEmail.set(ek, l);
    }
    for (const p of people.values()) {
      const lead = byPhone.get(phoneKey(p.phone)) ?? byEmail.get(p.email);
      if (!lead) continue;
      const stageSet = Date.parse(lead.updated_at);
      p.reasons = p.reasons.filter((r) => {
        if (r.leadId) return true;
        r.leadId = lead.id;
        // A lead parked with "תזכירי לי" counts as dealt with until (and after) its reminder: older reasons are not listed again.
        const settled = SETTLED_STAGES.has(lead.status) || (lead.status === "follow_up" && !!lead.remind_at);
        if (!settled || r.icon === "💳" || r.icon === "✏️") return true;
        return !(r.at && isFinite(stageSet) && stageSet > Date.parse(r.at));
      });
    }
    for (const [k, p] of people) if (p.reasons.length === 0) people.delete(k);
  }, "lead_match");

  return [...people.values()].sort((a, b) => Math.max(...b.reasons.map((r) => r.weight)) - Math.max(...a.reasons.map((r) => r.weight)));
}

/** Stages that mean "she dealt with it": a waiting item from another source that is older than the stage is dropped. */
const SETTLED_STAGES = new Set(["replied", "in_talk", "booked", "not_relevant"]);

const SOURCE_BY_KIND: Record<string, string> = {
  phone: "phone",
  photography_request: "photography_request",
  funnel: "funnel",
  booking_draft: "booking_draft",
  booking: "booking",
};

/**
 * People in the digest who have no lead row yet (phone message, photography request, funnel lead, abandoned booking, unpaid
 * deposit) get one, so every person with contact details has the stage buttons. The row starts as "new" and is marked with
 * DIGEST_NOTE so the digest does not list it a second time. People with no phone and no e-mail (nothing to act on) get none.
 */
async function ensureLeadRows(db: any, people: Person[]): Promise<void> {
  for (const p of people) {
    if (p.reasons.some((r) => r.leadId)) continue;
    if (!p.phone && !p.email) continue;
    try {
      const top = [...p.reasons].sort((a, b) => b.weight - a.weight)[0];
      const { data, error } = await db
        .from("inquiry_leads")
        .insert({
          name: p.name || null,
          email: p.email || null,
          phone: p.phone || null,
          source: SOURCE_BY_KIND[p.sourceKind] ?? "other",
          topic: "other",
          message: clipRaw(String(top?.text ?? "").replace(/<[^>]*>/g, ""), 300) || null,
          status: "new",
          first_contact_at: p.firstAt ?? new Date().toISOString(),
          notes: DIGEST_NOTE,
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (data?.id) for (const r of p.reasons) r.leadId = data.id;
    } catch (e) {
      console.error("[SWEETBABY] follow-up digest could not open a lead row", e);
    }
  }
}

async function stageButtons(leadIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of leadIds) out[id] = await leadStatusButtonsHtml(id);
  return out;
}

async function renderHtml(people: Person[], stillWaiting: number): Promise<string> {
  const fresh = new Set<string>();
  const buttons = await stageButtons([...new Set(people.flatMap((p) => p.reasons.map((r) => r.leadId).filter(Boolean) as string[]))]);
  const rows = people
    .map((p) => {
      const isNew = false;
      const contact = [
        p.phone ? `<a href="tel:${esc(digits(p.phone))}" style="color:#2d3d2b;font-weight:700" dir="ltr">${esc(p.phone)}</a>` : "",
        p.email ? `<a href="mailto:${esc(p.email)}" style="color:#2d3d2b" dir="ltr">${esc(p.email)}</a>` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const reasons = [...p.reasons]
        .sort((a, b) => b.weight - a.weight)
        .map((r) => `<li style="margin:3px 0">${r.icon} ${r.text} <span style="color:#8a9a85;font-size:12px">${esc(ageHe(r.at))}</span></li>`)
        .join("");
      return `<div style="background:#faf7f4;border-radius:12px;padding:12px 16px;margin:10px 0;${isNew ? "border-right:4px solid #d98b7a" : ""}">
        <div style="font-size:16px;font-weight:700;color:#2d3d2b">${esc(p.name || "ללא שם")}${isNew ? ' <span style="font-size:11px;background:#d98b7a;color:#fff;border-radius:999px;padding:2px 8px;margin-right:6px">חדש</span>' : ""}</div>
        <div style="margin:4px 0 6px;font-size:14px">${contact || '<span style="color:#8a9a85">אין פרטי קשר — שיחת צ׳אט אנונימית</span>'}</div>
        <ul style="margin:0;padding:0 18px;font-size:14px;color:#2d3d2b">${reasons}</ul>
        ${[...new Set(p.reasons.map((r) => r.leadId).filter(Boolean) as string[])].map((id) => buttons[id] ?? "").join("")}
      </div>`;
    })
    .join("");
  return `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:620px;margin:auto;line-height:1.6">
    <h2 style="margin-bottom:4px">📋 למי לחזור עכשיו</h2>
    <p style="margin:0 0 8px;color:#6b8a63">${people.length} ממתינות לתשובה כבר ${WAITING_DAYS} ימים או יותר. מסודר לפי דחיפות.</p>
    ${rows}
    <p style="color:#6b8a63;font-size:12px;margin-top:18px">פניות וטלפונים: <a href="${SITE}/admin/leads">${SITE}/admin/leads</a> · התראות: <a href="${SITE}/admin/notifications">${SITE}/admin/notifications</a><br>כשסימנת הודעה כנקראה או שינית סטטוס לליד (בכפתורים "לא רלוונטי" / "שנה סטטוס" כאן) — היא יוצאת מהרשימה. מוצגים רק לידים מ-${LEAD_WINDOW_DAYS} הימים האחרונים. הסיכום נשלח פעם ביום ב-20:00.</p>
  </div>`;
}

/** Ready reply drafts waiting in Gmail (prepared by the e-mail assistant, not yet sent). */
async function readyDrafts(): Promise<Array<{ to: string; subject: string }>> {
  try {
    const g = await import("@/integrations/google/gmail.server");
    const acc = await g.resolveGmailAccount();
    if (!acc) return [];
    const list = await g.gmailApi<any>(acc.connKey, "/users/me/drafts?maxResults=40");
    const out: Array<{ to: string; subject: string }> = [];
    for (const d of (list?.drafts ?? []).slice(0, 40)) {
      const m = await g.gmailApi<any>(acc.connKey, `/users/me/drafts/${d.id}?format=metadata&metadataHeaders=To&metadataHeaders=Subject`);
      const to = g.gmailHeaderValue(m?.message?.payload?.headers, "To");
      const subject = g.gmailHeaderValue(m?.message?.payload?.headers, "Subject");
      if (to) out.push({ to, subject: subject || "(ללא נושא)" });
    }
    return out;
  } catch {
    return [];
  }
}

export async function runHourlyFollowUpDigest(opts: { force?: boolean } = {}): Promise<{ sent: boolean; reason?: string; people?: number }> {
  if (!opts.force && !windowOpen()) return { sent: false, reason: "outside_hours" };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const state = await loadState(db);
  if (!opts.force && state.at && Date.now() - Date.parse(state.at) < MIN_GAP_MS) return { sent: false, reason: "too_soon" };

  // Only people whose reason has been waiting WAITING_DAYS or more (nobody answered).
  const cutoff = Date.now() - WAITING_DAYS * 86_400_000;
  const all = await collectFollowUps(db);
  const people: Person[] = [];
  for (const p of all) {
    const old = p.reasons.filter((r) => r.at && Date.parse(r.at) <= cutoff);
    if (old.length) people.push({ ...p, reasons: old });
  }
  // Owner, 2026-11-26: nobody who already paid / ordered is listed.
  try {
    const { isClosedCustomer } = await import("@/lib/visitor-tracking.server");
    for (let i = people.length - 1; i >= 0; i--) {
      if (await isClosedCustomer(db, people[i].phone || null, people[i].email || null)) people.splice(i, 1);
    }
  } catch (e) {
    console.error("[SWEETBABY] digest closed-customer check failed", e);
  }
  const drafts = await readyDrafts();
  if (people.length === 0 && drafts.length === 0) {
    await db.from("app_settings").upsert({ key: STATE_KEY, value: JSON.stringify({ ...state, at: new Date().toISOString() }), updated_at: new Date().toISOString() });
    return { sent: false, reason: "nothing_waiting", people: 0 };
  }
  await ensureLeadRows(db, people);
  const { sendGmailDetailed } = await import("@/integrations/google/gmail.server");
  const dayLabel = new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric" });
  const draftsHtml = drafts.length
    ? `<h3 style="margin:18px 0 6px">✍️ טיוטות מוכנות לשליחה (${drafts.length})</h3><ul style="padding:0 18px;font-size:14px">${drafts.map((d) => `<li style="margin:3px 0">${esc(d.to)} — ${esc(d.subject)}</li>`).join("")}</ul><p style="font-size:12px;color:#6b8a63"><a href="${SITE}/admin/mail-chat">לפתיחה במסך המיילים</a></p>`
    : "";
  const body = people.length ? await renderHtml(people, 0) : `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:620px;margin:auto"></div>`;
  const res = await sendGmailDetailed({
    to: DIGEST_TO,
    subject: `📋 למי לחזור — ${dayLabel}`,
    html: body.replace(/<\/div>\s*$/, `${draftsHtml}</div>`),
    fromName: "Sweetbaby · סיכום יומי",
  });
  if (!res.ok) return { sent: false, reason: "send_failed", people: people.length };
  await db.from("app_settings").upsert({ key: STATE_KEY, value: JSON.stringify({ at: new Date().toISOString(), ids: [], day: "" }), updated_at: new Date().toISOString() });
  return { sent: true, people: people.length };
}

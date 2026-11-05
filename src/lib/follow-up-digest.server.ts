// Hourly "who to get back to, and why" summary mail for the owner (owner request 2026-11-05).
// Collects everything that is waiting for a human answer from the places leads arrive:
//   - phone: voice-bot "leave a message" notifications (admin_notifications.voice_message)
//   - phone/site: "photography with Michal" requests (admin_notifications.photography_request)
//   - chat: site-chat conversations flagged as real intent (admin_notifications.site_chat_important)
//   - mail + manual: inquiry_leads (the e-mail assistant files e-mail inquiries there) that nobody answered
//   - funnel leads marked hot, booking drafts abandoned mid-way, studio bookings whose deposit is unpaid
// People are merged by phone/e-mail so one person = one line with all her reasons. Sent at most once per
// hour, only inside the sending window (Israel time, not Shabbat), and only when something is waiting.
// Called by the external scheduler through /api/send-booking-reminders.

const DIGEST_TO = "m0548529277@gmail.com";
const STATE_KEY = "follow_up_digest_state";
const MIN_GAP_MS = 55 * 60_000;
const SITE = "https://sweetbabyphoto.shop";

type Reason = { weight: number; icon: string; text: string; at: string | null };
type Person = { key: string; name: string; phone: string; email: string; reasons: Reason[] };

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
  return mins >= 7 * 60 + 30 && mins <= 23 * 60 + 30;
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
function waLink(p: string): string {
  const d = digits(p);
  const intl = d.startsWith("972") ? d : d.startsWith("0") ? `972${d.slice(1)}` : d;
  return `https://wa.me/${intl}`;
}

async function loadState(db: any): Promise<{ at: string | null; keys: string[] }> {
  const { data } = await db.from("app_settings").select("value").eq("key", STATE_KEY).maybeSingle();
  try {
    const v = JSON.parse(data?.value || "{}");
    return { at: v.at ?? null, keys: Array.isArray(v.keys) ? v.keys : [] };
  } catch {
    return { at: null, keys: [] };
  }
}

export async function collectFollowUps(db: any): Promise<Person[]> {
  const people = new Map<string, Person>();
  const add = (p: { id: string; name?: string | null; phone?: string | null; email?: string | null }, r: Reason) => {
    const pk = phoneKey(p.phone);
    const ek = String(p.email ?? "").trim().toLowerCase();
    // Merge by phone first, then e-mail; otherwise the source row is its own person.
    const key = pk ? `p:${pk}` : ek ? `e:${ek}` : `id:${p.id}`;
    const cur = people.get(key) ?? { key, name: "", phone: "", email: "", reasons: [] };
    if (!cur.name && p.name) cur.name = String(p.name).trim();
    if (!cur.phone && p.phone) cur.phone = String(p.phone).trim();
    if (!cur.email && ek) cur.email = ek;
    cur.reasons.push(r);
    people.set(key, cur);
  };

  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
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
      .in("type", ["voice_message", "photography_request", "site_chat_important"])
      .is("read_at", null)
      .gte("created_at", iso(now - 3 * 86_400_000))
      .order("created_at", { ascending: false })
      .limit(300);
    const chatSeen = new Set<string>();
    for (const n of data ?? []) {
      const b = (n.body ?? {}) as any;
      if (n.type === "voice_message") {
        add(
          { id: n.id, name: b.contact_name, phone: b.phone },
          { weight: 80, icon: "📞", text: `השאירה הודעה בטלפון: "${clip(b.message, 160)}"${b.context ? ` (${clip(b.context, 60)})` : ""}`, at: n.created_at },
        );
      } else if (n.type === "photography_request") {
        const name = String(n.title ?? "").split("·").pop()?.trim() || null;
        add(
          { id: n.id, name, phone: b.phone, email: b.email },
          { weight: 90, icon: "📷", text: `ביקשה צילומים עם מיכל${b.session_type ? ` (${esc(b.session_type)})` : ""}${b.date ? ` ל-${esc(b.date)}${b.start_time ? ` ${esc(b.start_time)}` : ""}` : ""}${b.price ? ` · ₪${esc(b.price)}` : ""}`, at: n.created_at },
        );
      } else {
        const sid = String(b.session_id ?? n.id);
        if (chatSeen.has(sid) || Date.parse(n.created_at) < now - 86_400_000) continue;
        chatSeen.add(sid);
        add(
          { id: `chat-${sid}` },
          { weight: 30, icon: "💬", text: `שיחת צ׳אט עם כוונה ממשית (אין פרטי קשר): "${clip(b.snippet, 120)}"`, at: n.created_at },
        );
      }
    }
  }, "notifications");

  // E-mail / manual inquiries nobody answered (the e-mail assistant files inbound mail into inquiry_leads).
  await safe(async () => {
    const { data } = await db
      .from("inquiry_leads")
      .select("id, name, email, phone, topic, message, status, first_contact_at, last_contact_at, follow_up_sent_at, source")
      .in("status", ["new", "replied", "follow_up"])
      .gte("first_contact_at", iso(now - 14 * 86_400_000))
      .limit(200);
    for (const l of data ?? []) {
      const first = Date.parse(l.first_contact_at);
      const last = Date.parse(l.last_contact_at ?? l.first_contact_at);
      const src = esc(l.source === "email" || l.source === "gmail" ? "מייל" : l.source === "phone" ? "טלפון" : l.source || "פנייה");
      if (l.status === "new" && now - first > 60 * 60_000) {
        add({ id: l.id, name: l.name, phone: l.phone, email: l.email }, { weight: 70, icon: "✉️", text: `פנייה (${src}) שעוד לא נענתה: "${clip(l.message, 140)}"`, at: l.first_contact_at });
      } else if (l.status === "follow_up") {
        add({ id: l.id, name: l.name, phone: l.phone, email: l.email }, { weight: 60, icon: "🔁", text: `סומנה "לחזור אליה": "${clip(l.message, 120)}"`, at: l.last_contact_at ?? l.first_contact_at });
      } else if (l.status === "replied" && !l.follow_up_sent_at && now - last > 3 * 86_400_000) {
        add({ id: l.id, name: l.name, phone: l.phone, email: l.email }, { weight: 50, icon: "⏳", text: `ענית לה ושותקת 3+ ימים — כדאי מעקב: "${clip(l.message, 100)}"`, at: l.last_contact_at ?? l.first_contact_at });
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
      add({ id: l.id, name: l.name, phone: l.phone, email: l.email }, { weight: 75, icon: "🔥", text: `ליד חם מהשאלון${l.funnel ? ` (${esc(l.funnel)})` : ""}${l.recommendation ? `: ${clip(l.recommendation, 80)}` : ""}`, at: l.created_at });
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
      add({ id: d.client_key, name: d.name, phone: d.phone, email: d.email }, { weight: 55, icon: "🛒", text: `התחילה הזמנה ולא סיימה${d.step ? ` (נעצרה בשלב ${esc(d.step)})` : ""}`, at: d.updated_at });
    }
  }, "booking_drafts");

  await safe(async () => {
    const { data } = await db
      .from("bookings")
      .select("id, contact_name, contact_phone, contact_email, session_date, start_time, price, created_at")
      .eq("deposit_status", "pending")
      .neq("status", "cancelled")
      .gte("session_date", today)
      .lte("created_at", iso(now - 60 * 60_000))
      .limit(60);
    for (const b of data ?? []) {
      const [y, m, d] = String(b.session_date).split("-");
      add(
        { id: b.id, name: b.contact_name, phone: b.contact_phone, email: b.contact_email },
        { weight: b.session_date === today ? 100 : 65, icon: "💳", text: `שריון סטודיו ל-${d}/${m} ${String(b.start_time ?? "").slice(0, 5)} — המקדמה עוד לא שולמה`, at: b.created_at },
      );
    }
  }, "bookings");

  return [...people.values()].sort((a, b) => Math.max(...b.reasons.map((r) => r.weight)) - Math.max(...a.reasons.map((r) => r.weight)));
}

function renderHtml(people: Person[], fresh: Set<string>): string {
  const rows = people
    .map((p) => {
      const isNew = fresh.has(p.key);
      const contact = [
        p.phone ? `<a href="tel:${esc(digits(p.phone))}" style="color:#2d3d2b;font-weight:700" dir="ltr">${esc(p.phone)}</a> · <a href="${waLink(p.phone)}" style="color:#1f7a4d">וואטסאפ</a>` : "",
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
      </div>`;
    })
    .join("");
  return `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:620px;margin:auto;line-height:1.6">
    <h2 style="margin-bottom:4px">📋 למי לחזור עכשיו</h2>
    <p style="margin:0 0 8px;color:#6b8a63">${people.length} ${people.length === 1 ? "מישהי מחכה" : "מחכות"} לתשובה${fresh.size ? ` · ${fresh.size} חדשות מאז הסיכום הקודם` : ""}. מסודר לפי דחיפות.</p>
    ${rows}
    <p style="color:#6b8a63;font-size:12px;margin-top:18px">פניות וטלפונים: <a href="${SITE}/admin/leads">${SITE}/admin/leads</a> · התראות: <a href="${SITE}/admin/notifications">${SITE}/admin/notifications</a><br>כשסימנת הודעה כנקראה או שינית סטטוס לליד — היא יוצאת מהרשימה. הסיכום נשלח פעם בשעה, רק כשיש מישהי שמחכה.</p>
  </div>`;
}

export async function runHourlyFollowUpDigest(opts: { force?: boolean } = {}): Promise<{ sent: boolean; reason?: string; people?: number }> {
  if (!opts.force && !windowOpen()) return { sent: false, reason: "outside_hours" };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const state = await loadState(db);
  if (!opts.force && state.at && Date.now() - Date.parse(state.at) < MIN_GAP_MS) return { sent: false, reason: "too_soon" };

  const people = await collectFollowUps(db);
  if (people.length === 0) return { sent: false, reason: "nothing_waiting", people: 0 };

  const seen = new Set(state.keys);
  const fresh = new Set(people.filter((p) => !seen.has(p.key)).map((p) => p.key));
  const { sendGmail } = await import("@/integrations/google/gmail.server");
  const ok = await sendGmail({
    to: DIGEST_TO,
    subject: `📋 למי לחזור עכשיו (${people.length})${fresh.size ? ` · ${fresh.size} חדשות` : ""}`,
    html: renderHtml(people, fresh),
    fromName: "Sweetbaby · סיכום שעתי",
  });
  if (!ok) return { sent: false, reason: "send_failed", people: people.length };
  await db.from("app_settings").upsert({ key: STATE_KEY, value: JSON.stringify({ at: new Date().toISOString(), keys: people.map((p) => p.key) }), updated_at: new Date().toISOString() });
  return { sent: true, people: people.length };
}

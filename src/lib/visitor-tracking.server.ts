/**
 * Server side of "visitor tracking + lead journey" (owner request 2026-11-03).
 *
 * The browser (only after the visitor accepted the cookie banner) sends a persistent random visitor id in the
 * `x-visitor-id` header of every server-function call (see visitor-id-middleware.ts). When that visitor leaves
 * details herself (a booking, an order, the questionnaire, a booking draft) we store a row in visitor_identities,
 * which ties her browsing history to the person. Nothing here tries to identify anybody who did not leave details,
 * and nothing leaves our own database except the alert email to the owner.
 *
 * Everything in this file is best-effort: it must never break the booking / order it is attached to.
 */
import { getRequestHeader } from "@tanstack/react-start/server";
import { isOwnerTestContact } from "@/lib/lead-exclusions";
import { rowMatches, parseIgnoreList, inIgnoreList, last9, lowerEmail } from "@/lib/closed-customer";
import { buildJourney, emailKey, phoneKey, type VisitorJourney } from "@/lib/visitor-journey";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWNER_EMAIL = "m0548529277@gmail.com";
/** Details of the owner herself (testing her own site) never trigger an alert. */
const OWNER_KEYS = new Set(["m0548529277@gmail.com"]);
const OWNER_PHONES = new Set(["534181051", "548529277", "583270184"]); // 053-418-1051 (business), 054-852-9277 and 058-327-0184 (owner and husband)
const why0 = (reason: string, hot: string[]) => (reason === "returned" ? "חזרה לאתר אחרי שהשאירה פרטים" : hot.join(" · ")).slice(0, 200);
const ALERT_KEY = "visitor_alerts";
const ALERT_PER_VISITOR_MS = 24 * 3600 * 1000;
const ALERT_MAX_PER_DAY = 10;
const MAX_IDENTITIES_PER_VISITOR = 30;
const SITE = "https://sweetbabyphoto.shop";

export type IdentityKind = "booking_draft" | "booking" | "order" | "intake" | "contact" | "chat_lead" | "funnel";

export function visitorIdFromRequest(): string | null {
  try {
    const v = (getRequestHeader as any)("x-visitor-id") as string | undefined;
    return v && UUID_RE.test(v) ? v.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type LinkArgs = { kind: IdentityKind; refId: string; name?: string | null; phone?: string | null; email?: string | null };

/** Links the visitor id found in the current request to the details she just left. Never throws. */
export async function linkVisitorFromRequest(args: LinkArgs): Promise<boolean> {
  try {
    const visitorId = visitorIdFromRequest();
    if (!visitorId) return false;
    return await linkVisitorIdentityRow(await admin(), visitorId, args);
  } catch (e) {
    console.error("[SWEETBABY] linkVisitorFromRequest failed", e);
    return false;
  }
}

export async function linkVisitorIdentityRow(db: any, visitorId: string, a: LinkArgs): Promise<boolean> {
  const phone = phoneKey(a.phone);
  const email = emailKey(a.email);
  if (!phone && !email) return false; // nothing to identify her by
  const refId = String(a.refId).slice(0, 80);
  if (!refId) return false;

  const { count } = await db.from("visitor_identities").select("id", { count: "exact", head: true }).eq("visitor_id", visitorId);
  if ((count ?? 0) >= MAX_IDENTITIES_PER_VISITOR) return false;

  const { error } = await db.from("visitor_identities").upsert(
    {
      visitor_id: visitorId,
      kind: a.kind,
      ref_id: refId,
      name: a.name ? String(a.name).trim().slice(0, 100) : null,
      phone,
      email,
    },
    { onConflict: "visitor_id,kind,ref_id" },
  );
  if (error) {
    console.error("[SWEETBABY] visitor_identities upsert failed", error.message);
    return false;
  }
  await maybeSendAlert(db, visitorId, "identified").catch((e) => console.error("[SWEETBABY] visitor alert failed", e));
  return true;
}

/** Sessions + page views of one or many visitor ids, merged into one journey. */
export async function journeyForVisitors(db: any, visitorIds: string[]): Promise<VisitorJourney> {
  if (visitorIds.length === 0) return buildJourney([], []);
  const { data: sessions } = await db
    .from("analytics_sessions")
    .select("id, first_seen, last_seen, source")
    .in("visitor_id", visitorIds)
    .limit(500);
  const ids = (sessions ?? []).map((s: any) => s.id);
  if (ids.length === 0) return buildJourney([], []);
  const { data: events } = await db
    .from("analytics_events")
    .select("session_id, type, path, duration_seconds")
    .in("session_id", ids)
    .eq("type", "pageview")
    .limit(20_000);
  return buildJourney(sessions ?? [], events ?? []);
}

export type ContactQuery = { key: string; phone?: string | null; email?: string | null };

/** For the admin screens: one journey per contact (matched by phone or email through visitor_identities). */
export async function journeysByContacts(db: any, contacts: ContactQuery[]): Promise<Record<string, VisitorJourney>> {
  const wantPhones = new Set<string>();
  const wantEmails = new Set<string>();
  const parsed = contacts.map((c) => ({ key: c.key, phone: phoneKey(c.phone), email: emailKey(c.email) }));
  for (const c of parsed) {
    if (c.phone) wantPhones.add(c.phone);
    if (c.email) wantEmails.add(c.email);
  }
  const rows: { visitor_id: string; phone: string | null; email: string | null }[] = [];
  if (wantPhones.size) {
    const { data } = await db.from("visitor_identities").select("visitor_id, phone, email").in("phone", Array.from(wantPhones)).limit(2000);
    rows.push(...(data ?? []));
  }
  if (wantEmails.size) {
    const { data } = await db.from("visitor_identities").select("visitor_id, phone, email").in("email", Array.from(wantEmails)).limit(2000);
    rows.push(...(data ?? []));
  }
  if (rows.length === 0) return {};

  const visitorsOf = (c: { phone: string | null; email: string | null }) => {
    const set = new Set<string>();
    for (const r of rows) if ((c.phone && r.phone === c.phone) || (c.email && r.email && r.email.toLowerCase() === c.email)) set.add(r.visitor_id);
    return Array.from(set);
  };
  const allVisitors = Array.from(new Set(rows.map((r) => r.visitor_id)));
  const { data: sessions } = await db
    .from("analytics_sessions")
    .select("id, first_seen, last_seen, source, visitor_id")
    .in("visitor_id", allVisitors)
    .limit(3000);
  const sessionIds = (sessions ?? []).map((s: any) => s.id);
  const { data: events } = sessionIds.length
    ? await db
        .from("analytics_events")
        .select("session_id, type, path, duration_seconds")
        .in("session_id", sessionIds)
        .eq("type", "pageview")
        .limit(30_000)
    : { data: [] };

  const out: Record<string, VisitorJourney> = {};
  for (const c of parsed) {
    const vids = new Set(visitorsOf(c));
    if (vids.size === 0) continue;
    const mine = (sessions ?? []).filter((s: any) => vids.has(s.visitor_id));
    if (mine.length === 0) continue;
    out[c.key] = buildJourney(mine, events ?? []);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Alert email to the owner: a person we already know (she left details) who is "hot", or who came back.
// At most one alert per visitor per 24h and 10 per day, state kept in app_settings (no migration).
// ---------------------------------------------------------------------------------------------------------------

type AlertState = { perVisitor: Record<string, number>; day: { date: string; count: number } };

async function loadAlertState(db: any): Promise<AlertState> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  try {
    const { data } = await db.from("app_settings").select("value").eq("key", ALERT_KEY).maybeSingle();
    const v = JSON.parse(data?.value || "{}");
    const perVisitor: Record<string, number> = {};
    const now = Date.now();
    for (const [k, t] of Object.entries(v.perVisitor ?? {})) if (typeof t === "number" && now - t < 2 * ALERT_PER_VISITOR_MS) perVisitor[k] = t;
    const day = v.day?.date === today && Number.isFinite(v.day.count) ? v.day : { date: today, count: 0 };
    return { perVisitor, day };
  } catch {
    return { perVisitor: {}, day: { date: today, count: 0 } };
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** True when this phone/email already closed (booking/order/package) or is in app_settings.visitor_alert_ignore. */
async function isClosedCustomer(db: any, phone: string | null, email: string | null): Promise<boolean> {
  const p = last9(phone), e = lowerEmail(email);
  if (!p && !e) return false;
  const { data: ign } = await db.from("app_settings").select("value").eq("key", "visitor_alert_ignore").maybeSingle();
  if (ign?.value != null && inIgnoreList(parseIgnoreList(ign.value), phone, email)) return true;
  const orFilter = [p ? `contact_phone.ilike.%${p.slice(-4)}%` : null, e ? `contact_email.ilike.${e}` : null].filter(Boolean).join(",");
  const check = async (q: any) => {
    const { data, error } = await q.or(orFilter).limit(500);
    if (error) throw error;
    return ((data ?? []) as any[]).some((r) => rowMatches(r, phone, email));
  };
  const cols = "contact_phone, contact_email";
  if (await check(db.from("bookings").select(cols).in("status", ["confirmed", "completed"]))) return true;
  if (await check(db.from("orders").select(cols).in("status", ["confirmed", "active", "returned"]))) return true;
  for (const t of ["newborn_package_orders", "outdoor_package_orders"]) {
    if (await check(db.from(t).select(`${cols}, contract_confirmed_at, amount_paid`).or("contract_confirmed_at.not.is.null,amount_paid.gt.0"))) return true;
  }
  return false;
}

export async function maybeSendAlert(db: any, visitorId: string, reason: "identified" | "returned"): Promise<boolean> {
  const { data: ids } = await db
    .from("visitor_identities")
    .select("name, phone, email, kind, created_at")
    .eq("visitor_id", visitorId)
    .order("created_at", { ascending: false })
    .limit(10);
  const identities = (ids ?? []) as { name: string | null; phone: string | null; email: string | null; kind: string }[];
  if (identities.length === 0) return false;
  const phone = identities.find((i) => i.phone)?.phone ?? null;
  const email = identities.find((i) => i.email)?.email ?? null;
  const name = identities.find((i) => i.name)?.name ?? null;
  if ((email && OWNER_KEYS.has(email)) || (phone && OWNER_PHONES.has(phone))) return false;
  if (isOwnerTestContact({ name, email, phone: phone ? `0${phone}` : null })) return false;

  try {
    if (await isClosedCustomer(db, phone, email)) return false;
  } catch (e) {
    console.error("[SWEETBABY] closed-customer check failed", e);
  }

  const journey = await journeyForVisitors(db, [visitorId]);
  if (reason === "identified" && !journey.hot) return false;
  if (reason === "returned" && journey.visits < 2) return false;

  const state = await loadAlertState(db);
  if (Date.now() - (state.perVisitor[visitorId] ?? 0) < ALERT_PER_VISITOR_MS) return false;
  if (state.day.count >= ALERT_MAX_PER_DAY) return false;

  const { sendGmail } = await import("@/integrations/google/gmail.server");
  // Instead of the WhatsApp link: "לא רלוונטי" / "שנה סטטוס" (needs a lead row; mailed without buttons when none can be opened).
  const { findOrCreateLeadId, leadStatusButtonsHtml } = await import("@/lib/lead-status.server");
  const leadId = await findOrCreateLeadId(db, { name, phone: phone ? `0${phone}` : null, email, source: "other", message: why0(reason, journey.hotReasons) });
  const statusButtons = leadId ? await leadStatusButtonsHtml(leadId) : "";
  const pages = journey.pages
    .slice(0, 6)
    .map((p) => `<li>${esc(p.label)} · ${p.views} צפיות${p.seconds ? ` · ${p.seconds} שנ׳` : ""}</li>`)
    .join("");
  const why = reason === "returned" ? "חזרה לאתר אחרי שהשאירה פרטים" : journey.hotReasons.join(" · ");
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:520px;line-height:1.6;color:#3b2f2a">
    <h2 style="margin:0 0 8px">🔥 ${esc(name || "מבקרת")} ${reason === "returned" ? "חזרה לאתר" : "ליד חם"}</h2>
    <p style="margin:0 0 12px">${esc(why)}</p>
    <p style="margin:0 0 12px">${phone ? `טלפון: <b dir="ltr">0${esc(phone)}</b>` : ""}${email ? `<br>מייל: <span dir="ltr">${esc(email)}</span>` : ""}</p>
    <p style="margin:0 0 4px"><b>${journey.visits}</b> ביקורים · ${journey.totalSeconds} שניות פעילות באתר</p>
    <ul style="margin:6px 0 14px;padding-right:20px">${pages}</ul>
    ${statusButtons}
    <p style="margin:10px 0 0;font-size:13px;color:#8a7466">פירוט מלא: <a href="${SITE}/admin/leads">${SITE}/admin/leads</a></p>
  </div>`;
  const sent = await sendGmail({
    to: OWNER_EMAIL,
    subject: `🔥 ${reason === "returned" ? "חזרה לאתר" : "ליד חם"}: ${name || phone || email || "מבקרת"}`,
    html,
    fromName: "Sweetbaby · התראת ליד",
  });
  if (sent) {
    state.perVisitor[visitorId] = Date.now();
    state.day.count += 1;
    await db.from("app_settings").upsert({ key: ALERT_KEY, value: JSON.stringify(state), updated_at: new Date().toISOString() });
  }
  return sent;
}

/** Called when a new browsing session starts for a visitor we already know. */
export async function maybeAlertReturningVisitor(db: any, visitorId: string): Promise<void> {
  try {
    await maybeSendAlert(db, visitorId, "returned");
  } catch (e) {
    console.error("[SWEETBABY] returning-visitor alert failed", e);
  }
}

/** Adds active seconds to the newest page view of this session + path (additive: a page can be left and re-entered). */
export async function addDwell(db: any, sessionId: string, path: string, seconds: number): Promise<void> {
  const sec = Math.max(0, Math.min(1800, Math.round(seconds)));
  if (!sec) return;
  const { data: row } = await db
    .from("analytics_events")
    .select("id, duration_seconds")
    .eq("session_id", sessionId)
    .eq("type", "pageview")
    .eq("path", path)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return;
  const next = Math.min(3600, (row.duration_seconds ?? 0) + sec);
  await db.from("analytics_events").update({ duration_seconds: next }).eq("id", row.id);
}

/** A small HTML block with the browsing history of the visitor in the current request (for the owner's lead emails). Empty string when there is none. */
export async function journeyEmailBlock(): Promise<string> {
  try {
    const visitorId = visitorIdFromRequest();
    if (!visitorId) return "";
    const j = await journeyForVisitors(await admin(), [visitorId]);
    if (j.visits === 0) return "";
    const rows = j.pages
      .slice(0, 6)
      .map((p) => `<li>${esc(p.label)} · ${p.views} צפיות${p.seconds ? ` · ${p.seconds} שנ׳` : ""}</li>`)
      .join("");
    return `<div style="margin:14px 0 0;padding:12px 14px;background:#fff;border-radius:10px;font-size:14px">
      <div style="font-weight:bold;margin-bottom:4px">👣 היסטוריית גלישה${j.hot ? " · ליד חם 🔥" : ""}</div>
      <div style="color:#8a7466;margin-bottom:6px">${j.visits} ביקורים · ${j.totalSeconds} שניות פעילות${j.hot ? ` · ${esc(j.hotReasons.join(" · "))}` : ""}</div>
      <ul style="margin:0;padding-right:20px">${rows}</ul></div>`;
  } catch (e) {
    console.error("[SWEETBABY] journeyEmailBlock failed", e);
    return "";
  }
}

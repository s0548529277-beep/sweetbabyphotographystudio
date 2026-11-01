/**
 * Two customer follow-up emails (owner request 2026-11-02), run from the
 * existing cron route (/api/send-booking-reminders):
 *
 *  1. Thank-you after the session: a warm thanks, a review request and a
 *     button to book the next session. Sent once, 1.5–36 hours after the
 *     session ended, only for confirmed (calendar-synced) bookings.
 *  2. Unfinished booking: a gentle nudge to someone who picked a slot on the
 *     website but never paid the deposit (3–30 hours after she started),
 *     with a link back to the payment page and a "continue in the chat" button.
 *
 * Both go to the customer only (no studio copy), never on Shabbat, only
 * 9:00–21:00 Israel time, and each booking is emailed at most once — the
 * sent ids live in app_settings ("booking_followups_sent"), so no migration.
 * Not for phone bookings and not for placeholder (phone-only) accounts.
 * The review button needs GOOGLE_REVIEW_URL in the environment; without it
 * the email simply asks her to reply with a few words.
 */
import { buildChatButtonHtml, pillButton, buildContinueOrderHtml } from "@/lib/orderSummary";
import { PHONE_BOOKING_NOTES_MARKER } from "@/lib/availability.server";
import { isPlaceholderEmail } from "@/lib/auth.functions";

const SENT_KEY = "booking_followups_sent";
const SITE = "https://sweetbabyphoto.shop";
const MAX_PER_RUN = 5;

type Sent = { thanks: string[]; unfinished: string[] };

function israelNow() {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(new Date());
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), hour: Number(get("hour")) % 24 };
}

/** ms since epoch for a date + HH:MM given in Israel local time. */
function israelMs(date: string, time: string): number {
  const asUtc = Date.parse(`${date}T${String(time).slice(0, 5)}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(asUtc));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return asUtc - (shown - asUtc);
}

function sendWindowOpen(): boolean {
  const { weekday, hour } = israelNow();
  if (weekday === "Sat" || (weekday === "Fri" && hour >= 14)) return false;
  return hour >= 9 && hour < 21;
}

async function loadSent(db: any): Promise<Sent> {
  const { data } = await db.from("app_settings").select("value").eq("key", SENT_KEY).maybeSingle();
  try {
    const v = JSON.parse(data?.value || "{}");
    return { thanks: Array.isArray(v.thanks) ? v.thanks : [], unfinished: Array.isArray(v.unfinished) ? v.unfinished : [] };
  } catch {
    return { thanks: [], unfinished: [] };
  }
}

async function saveSent(db: any, sent: Sent) {
  const trimmed = { thanks: sent.thanks.slice(-400), unfinished: sent.unfinished.slice(-400) };
  await db.from("app_settings").upsert({ key: SENT_KEY, value: JSON.stringify(trimmed), updated_at: new Date().toISOString() });
}

async function customerEmailOf(db: any, userId: string): Promise<string | null> {
  const {
    data: { user },
  } = await db.auth.admin.getUserById(userId);
  const email = user?.email;
  return email && !isPlaceholderEmail(email) ? email : null;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function dateHe(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
}

export async function runDuePostSessionThanks(): Promise<{ checked: number; sent: number }> {
  if (!sendWindowOpen()) return { checked: 0, sent: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const from = new Date(Date.now() - 3 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

  const { data: rows, error } = await db
    .from("bookings")
    .select("id, user_id, session_date, start_time, end_time, contact_name, status, notes")
    .neq("status", "cancelled")
    .not("google_event_id", "is", null)
    .gte("session_date", from)
    .lte("session_date", today);
  if (error) {
    console.error("[SWEETBABY] post-session thanks scan failed", error);
    return { checked: 0, sent: 0 };
  }

  const sentReg = await loadSent(db);
  const done = new Set(sentReg.thanks);
  const reviewUrl = process.env.GOOGLE_REVIEW_URL?.trim();
  const { sendGmail } = await import("@/integrations/google/gmail.server");
  let sent = 0;

  for (const b of rows ?? []) {
    if (sent >= MAX_PER_RUN) break;
    if (done.has(b.id) || b.notes?.includes(PHONE_BOOKING_NOTES_MARKER)) continue;
    const hoursSince = (Date.now() - israelMs(b.session_date, b.end_time)) / 3_600_000;
    if (hoursSince < 1.5 || hoursSince > 36) continue;
    try {
      const to = await customerEmailOf(db, b.user_id);
      if (to) {
        const name = esc(b.contact_name || "");
        const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:600px;margin:auto;line-height:1.7">
          <h2 style="color:#2d3d2b">תודה שהיית אצלנו 💗</h2>
          <p>שלום ${name},</p>
          <p>היה לנו כיף לארח אותך בסטודיו Sweetbaby ב${esc(dateHe(b.session_date))}. מקווים שהצילומים יצאו מושלמים!</p>
          <p>${
            reviewUrl
              ? "אם נהנית, נשמח מאוד לכמה מילים — ביקורת קצרה עוזרת לצלמות אחרות למצוא אותנו:"
              : "אם נהנית, נשמח מאוד לכמה מילים — פשוט להשיב למייל הזה ולכתוב איך היה. זה עוזר לנו מאוד."
          }</p>
          <div style="text-align:center;margin:18px 0">
            ${reviewUrl ? pillButton(reviewUrl, "לכתיבת ביקורת ⭐", true) : ""}
          </div>
          <p>וכדי שלא תצטרכי לחכות — אפשר לשריין כבר עכשיו את הסשן הבא, ולבחור את השעה שנוחה לך:</p>
          <div style="text-align:center;margin:18px 0">${pillButton(`${SITE}/booking`, "לשריון הסשן הבא ←", !reviewUrl)}</div>
          ${buildChatButtonHtml({ kind: "booking", id: b.id, date: b.session_date })}
          <p style="color:#6b8a63;font-size:13px;margin-top:16px">סטודיו Sweetbaby · תלמוד ירושלמי 24, בית שמש · 054-8529277</p>
        </div>`;
        await sendGmail({ to, subject: "תודה שהיית אצלנו 💗 · Sweetbaby", html });
      }
      done.add(b.id);
      sentReg.thanks.push(b.id);
      sent += 1;
    } catch (e) {
      console.error("[SWEETBABY] post-session thanks failed for booking", b.id, e);
    }
  }
  if (sent) await saveSent(db, sentReg);
  return { checked: (rows ?? []).length, sent };
}

export async function runDueUnfinishedBookingFollowUps(): Promise<{ checked: number; sent: number }> {
  if (!sendWindowOpen()) return { checked: 0, sent: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const earliest = new Date(Date.now() - 30 * 3_600_000).toISOString();

  const { data: rows, error } = await db
    .from("bookings")
    .select("id, user_id, session_date, start_time, contact_name, status, deposit_status, notes, created_at")
    .eq("deposit_status", "pending")
    .neq("status", "cancelled")
    .gte("session_date", today)
    .gte("created_at", earliest);
  if (error) {
    console.error("[SWEETBABY] unfinished-booking scan failed", error);
    return { checked: 0, sent: 0 };
  }

  const sentReg = await loadSent(db);
  const done = new Set(sentReg.unfinished);
  const { sendGmail } = await import("@/integrations/google/gmail.server");
  let sent = 0;

  for (const b of rows ?? []) {
    if (sent >= MAX_PER_RUN) break;
    if (done.has(b.id) || b.notes?.includes(PHONE_BOOKING_NOTES_MARKER)) continue;
    const ageHours = (Date.now() - new Date(b.created_at as string).getTime()) / 3_600_000;
    if (ageHours < 3 || ageHours > 30) continue;
    try {
      const to = await customerEmailOf(db, b.user_id);
      if (to) {
        const name = esc(b.contact_name || "");
        const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:560px;margin:auto;line-height:1.7">
          <h2 style="color:#2d3d2b">ההזמנה שלך בסטודיו עדיין מחכה 💗</h2>
          <p>שלום ${name},</p>
          <p>בחרת מועד בסטודיו Sweetbaby ל${esc(dateHe(b.session_date))} בשעה ${esc(String(b.start_time).slice(0, 5))}, ורק רצינו לבדוק שלא נתקעת באמצע — אין שום התחייבות.</p>
          <p>אפשר להמשיך מאותו מקום, או לכתוב לנועה בצ׳אט — היא תבדוק שהמועד עדיין פנוי, תעזור לבחור מועד אחר ותסגור איתך את ההזמנה בקלות.</p>
          ${buildContinueOrderHtml(`${SITE}/deposit/booking/${b.id}`)}
          ${buildChatButtonHtml({ kind: "booking", id: b.id, date: b.session_date })}
          <p style="color:#6b8a63;font-size:13px;margin-top:16px">אם כבר סידרת הכל — סליחה על ההודעה, ותודה! · סטודיו Sweetbaby · 054-8529277</p>
        </div>`;
        await sendGmail({ to, subject: "ההזמנה שלך בסטודיו עדיין מחכה 💗 · Sweetbaby", html });
      }
      done.add(b.id);
      sentReg.unfinished.push(b.id);
      sent += 1;
    } catch (e) {
      console.error("[SWEETBABY] unfinished-booking follow-up failed for booking", b.id, e);
    }
  }
  if (sent) await saveSent(db, sentReg);
  return { checked: (rows ?? []).length, sent };
}

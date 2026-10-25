// Server pieces of "ניהול לקוחות" (/admin/client-management). The admin
// page reads/writes cm_clients / cm_sessions / cm_payment_accounts directly
// through the authenticated browser client (admin-only RLS, see
// 20261024000000_client_management.sql) — the same pattern as
// admin.outdoor-packages.tsx. Only what needs the server lives here:
// sending Gmail emails, and the periodic reminder/daily-schedule job that
// api.send-booking-reminders.ts runs alongside every other scheduled job.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CM_SETTINGS_KEY,
  balanceOf,
  formatDateIL,
  isRestDay,
  parseCmSettings,
  shekel,
  type CmSettings,
} from "@/lib/client-management";
import { hebrewDate } from "@/lib/hebrew-date";

const DAILY_LAST_SENT_KEY = "client_management_daily_schedule_last";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "admin")) throw new Error("אין הרשאת ניהול");
}

async function loadSettings(db: any): Promise<CmSettings> {
  const { data } = await db
    .from("app_settings")
    .select("value")
    .eq("key", CM_SETTINGS_KEY)
    .maybeSingle();
  return parseCmSettings(data?.value);
}

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nl2br(s: string) {
  return esc(s).replace(/\n/g, "<br>");
}

/** One RTL email shell in the site's own colors (forest green + blush). */
function emailShell(title: string, bodyHtml: string) {
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f7f3ee;font-family:Arial,Helvetica,sans-serif;color:#2d3d2b">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #ecdcd4">
    <div style="background:#2d3d2b;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">${esc(title)}</div>
    <div style="padding:22px;font-size:15px;line-height:1.7">${bodyHtml}</div>
  </div>
  <div style="text-align:center;font-size:12px;color:#8a8a80;margin-top:14px">Sweetbaby · מיכל סיבוני · 054-8529277</div>
</div></body></html>`;
}

/** Israel wall-clock parts for an instant. */
function israelParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = Number(get("hour")) % 24;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    minute: Number(get("minute")),
  };
}

/** UTC ms for an Israel-local date + "HH:MM". */
function israelLocalToUtcMs(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "09:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  // Offset = Israel wall time at `guess` minus UTC wall time at `guess`.
  const p = israelParts(new Date(guess));
  const [py, pm, pd] = p.date.split("-").map(Number);
  const asIfUtc = Date.UTC(py, pm - 1, pd, p.hour, p.minute);
  return guess - (asIfUtc - guess);
}

/** True while it's Shabbat/yom tov in Israel (Friday 16:00 → Saturday 20:00, roughly), so emails wait. */
function isQuietTimeInIsrael(now = new Date()) {
  const p = israelParts(now);
  const [y, m, d] = p.date.split("-").map(Number);
  const local = new Date(y, m - 1, d);
  const tomorrow = new Date(y, m - 1, d + 1);
  if (isRestDay(tomorrow) && p.hour >= 16) return true; // ערב שבת / ערב חג
  if (isRestDay(local) && p.hour < 20) return true; // שבת / חג עד צאת
  return false;
}

function reminderHtml(opts: {
  name: string;
  date: string;
  time: string;
  type: string;
  notes?: string | null;
  settings: CmSettings;
}) {
  const heb = hebrewDate(opts.date);
  const notes =
    opts.settings.includeNotesInReminder && opts.notes
      ? `<p style="background:#fbf1ee;border-radius:12px;padding:10px 14px">${nl2br(opts.notes)}</p>`
      : "";
  return emailShell(
    "תזכורת לצילום 📸",
    `<p>היי ${esc(opts.name)},</p>
<p>רק מזכירה שנפגשות לצילום <b>${esc(opts.type)}</b>:</p>
<p style="font-size:17px"><b>${esc(formatDateIL(opts.date))}</b>${heb ? ` · ${esc(heb)}` : ""}<br>בשעה <b>${esc(opts.time)}</b></p>
${notes}
<p>כתובת: תלמוד ירושלמי 24, בית שמש.<br>לכל שאלה אפשר לענות למייל הזה או להתקשר 054-8529277.</p>
<p>מחכה לכן 💗<br>מיכל</p>`,
  );
}

function paymentHtml(opts: {
  name: string;
  title: string;
  total: number;
  paid: number;
  dueDate: string | null;
  kind: "opened" | "updated";
  settings: CmSettings;
}) {
  const balance = Math.max(0, opts.total - opts.paid);
  const intro =
    opts.kind === "opened"
      ? "פתחתי עבורך חשבון תשלום. הנה הסיכום:"
      : balance === 0
        ? "התשלום התקבל במלואו — תודה רבה! 🙏"
        : "עדכון על מצב התשלום שלך:";
  const bank = opts.settings.bankDetails?.trim()
    ? `<p style="background:#f2f5f0;border-radius:12px;padding:10px 14px"><b>פרטים להעברה:</b><br>${nl2br(opts.settings.bankDetails)}</p>`
    : "";
  const links =
    opts.settings.paymentLinks?.trim() && balance > 0
      ? `<p><b>תשלום מהיר:</b><br>${nl2br(opts.settings.paymentLinks)}</p>`
      : "";
  return emailShell(
    "סיכום תשלום · Sweetbaby",
    `<p>היי ${esc(opts.name)},</p><p>${intro}</p>
<table style="width:100%;border-collapse:collapse;font-size:15px">
<tr><td style="padding:6px 0;color:#6b6b60">עבור</td><td style="padding:6px 0"><b>${esc(opts.title)}</b></td></tr>
<tr><td style="padding:6px 0;color:#6b6b60">סה״כ</td><td style="padding:6px 0">${shekel(opts.total)}</td></tr>
<tr><td style="padding:6px 0;color:#6b6b60">שולם</td><td style="padding:6px 0">${shekel(opts.paid)}</td></tr>
<tr><td style="padding:6px 0;color:#6b6b60">יתרה לתשלום</td><td style="padding:6px 0"><b style="color:${balance > 0 ? "#b4536a" : "#2f7a4a"}">${shekel(balance)}</b></td></tr>
${opts.dueDate && balance > 0 ? `<tr><td style="padding:6px 0;color:#6b6b60">לתשלום עד</td><td style="padding:6px 0">${esc(formatDateIL(opts.dueDate))}</td></tr>` : ""}
</table>${bank}${links}<p>תודה,<br>מיכל</p>`,
  );
}

async function scheduleHtmlFor(db: any, date: string) {
  const { data: sessions } = await db
    .from("cm_sessions")
    .select(
      "id, start_time, session_type, time_slot, part_label, notes, status, client:cm_clients(full_name, phone)",
    )
    .eq("session_date", date)
    .neq("status", "cancelled")
    .order("start_time");
  // Newborn-package orders (/admin/newborn-packages) share the same daily schedule.
  const { data: newborn } = await db
    .from("newborn_package_orders")
    .select("id, session_time, contact_name, contact_phone, notes")
    .eq("session_date", date);
  const rows = [
    ...((sessions ?? []) as any[]),
    ...((newborn ?? []) as any[]).map((o) => ({
      id: o.id,
      start_time: (o.session_time ?? "").slice(0, 5) || "—",
      session_type: "ניו בורן",
      part_label: null,
      notes: o.notes,
      client: { full_name: o.contact_name, phone: o.contact_phone },
    })),
  ].sort((x, y) => String(x.start_time).localeCompare(String(y.start_time)));
  const list = rows.length
    ? rows
        .map(
          (s) =>
            `<tr><td style="padding:8px;border-bottom:1px solid #f0e6e0"><b>${esc(s.start_time)}</b></td><td style="padding:8px;border-bottom:1px solid #f0e6e0">${esc(s.client?.full_name ?? "")}<br><span style="color:#6b6b60;font-size:13px">${esc(s.client?.phone ?? "")}</span></td><td style="padding:8px;border-bottom:1px solid #f0e6e0">${esc(s.session_type)}${s.part_label ? ` (${esc(s.part_label)})` : ""}${s.notes ? `<br><span style="color:#6b6b60;font-size:13px">${nl2br(s.notes)}</span>` : ""}</td></tr>`,
        )
        .join("")
    : `<tr><td style="padding:8px">אין צילומים ביום הזה.</td></tr>`;
  const heb = hebrewDate(date);
  return {
    count: rows.length,
    html: emailShell(
      `לו״ז צילומים · ${formatDateIL(date)}`,
      `<p>${heb ? esc(heb) : ""}</p><table style="width:100%;border-collapse:collapse;font-size:14px">${list}</table>`,
    ),
  };
}

// ---------- Admin actions ----------

export const sendCmSessionReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = context.supabase as any;
    const settings = await loadSettings(db);
    const { data: s, error } = await db
      .from("cm_sessions")
      .select(
        "id, session_date, start_time, session_type, notes, client:cm_clients(full_name, email)",
      )
      .eq("id", data.sessionId)
      .single();
    if (error || !s) throw new Error(error?.message ?? "הצילום לא נמצא");
    if (!s.client?.email) throw new Error("ללקוחה הזו אין כתובת מייל");
    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const ok = await sendGmail({
      to: s.client.email,
      subject: `תזכורת לצילום · ${formatDateIL(s.session_date)} בשעה ${s.start_time}`,
      html: reminderHtml({
        name: s.client.full_name,
        date: s.session_date,
        time: s.start_time,
        type: s.session_type,
        notes: s.notes,
        settings,
      }),
    });
    if (!ok) throw new Error("שליחת המייל נכשלה — בדקי את חיבור ה-Gmail של האתר");
    await db
      .from("cm_sessions")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", s.id);
    return { ok: true };
  });

export const sendCmPaymentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ accountId: z.string().uuid(), kind: z.enum(["opened", "updated"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = context.supabase as any;
    const settings = await loadSettings(db);
    const { data: a, error } = await db
      .from("cm_payment_accounts")
      .select("id, title, total_amount, paid_amount, due_date, client:cm_clients(full_name, email)")
      .eq("id", data.accountId)
      .single();
    if (error || !a) throw new Error(error?.message ?? "החשבון לא נמצא");
    const html = paymentHtml({
      name: a.client?.full_name ?? "",
      title: a.title,
      total: Number(a.total_amount || 0),
      paid: Number(a.paid_amount || 0),
      dueDate: a.due_date,
      kind: data.kind,
      settings,
    });
    const balance = balanceOf(a);
    const subject =
      data.kind === "opened"
        ? `סיכום תשלום · ${a.title}`
        : balance === 0
          ? `התשלום התקבל · ${a.title} 💗`
          : `עדכון תשלום · ${a.title}`;
    const recipients = [a.client?.email, settings.paymentCopyEmail].filter(
      (x): x is string => !!x && x.includes("@"),
    );
    if (!recipients.length) throw new Error("אין כתובת מייל לשליחה");
    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const results = await Promise.all(recipients.map((to) => sendGmail({ to, subject, html })));
    if (!results.some(Boolean))
      throw new Error("שליחת המייל נכשלה — בדקי את חיבור ה-Gmail של האתר");
    return { ok: true, sentToClient: !!a.client?.email };
  });

export const sendCmScheduleNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = context.supabase as any;
    const settings = await loadSettings(db);
    const { html, count } = await scheduleHtmlFor(db, data.date);
    const { sendGmail } = await import("@/integrations/google/gmail.server");
    const ok = await sendGmail({
      to: settings.scheduleEmail || "s0548529277@gmail.com",
      subject: `לו״ז צילומים ל-${formatDateIL(data.date)} (${count})`,
      html,
    });
    if (!ok) throw new Error("שליחת המייל נכשלה — בדקי את חיבור ה-Gmail של האתר");
    return { ok: true, count };
  });

// ---------- Periodic job ----------

/**
 * Runs from /api/send-booking-reminders (every 15–30 min). Sends each
 * client's pre-session reminder once, `reminderHoursBefore` ahead, and the
 * owner's "tomorrow's schedule" email once a day at `dailyScheduleHour`.
 * Holds everything during Shabbat/yom tov when noShabbatEmails is on — a
 * reminder that came due then goes out right after, as long as the
 * session hasn't started yet.
 */
export async function runDueClientManagementReminders(): Promise<{
  reminders: number;
  dailySchedule: boolean;
  skipped?: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  let settings: CmSettings;
  try {
    settings = await loadSettings(db);
  } catch {
    return { reminders: 0, dailySchedule: false, skipped: "settings" };
  }
  const now = new Date();
  if (settings.noShabbatEmails && isQuietTimeInIsrael(now))
    return { reminders: 0, dailySchedule: false, skipped: "shabbat" };

  const { sendGmail } = await import("@/integrations/google/gmail.server");
  let reminders = 0;

  if (settings.reminderEnabled) {
    const todayIL = israelParts(now).date;
    const horizon = new Date(now.getTime() + (settings.reminderHoursBefore + 1) * 3600_000);
    const horizonIL = israelParts(horizon).date;
    const { data: due, error } = await db
      .from("cm_sessions")
      .select(
        "id, session_date, start_time, session_type, notes, status, client:cm_clients(full_name, email)",
      )
      .is("reminder_sent_at", null)
      .eq("status", "scheduled")
      .gte("session_date", todayIL)
      .lte("session_date", horizonIL);
    if (error) {
      console.error("[SWEETBABY] client-management reminder scan failed", error);
    } else {
      for (const s of due ?? []) {
        const startMs = israelLocalToUtcMs(s.session_date, s.start_time);
        const sendFrom = startMs - settings.reminderHoursBefore * 3600_000;
        if (now.getTime() < sendFrom || now.getTime() >= startMs) continue;
        if (!s.client?.email) continue;
        const ok = await sendGmail({
          to: s.client.email,
          subject: `תזכורת לצילום · ${formatDateIL(s.session_date)} בשעה ${s.start_time}`,
          html: reminderHtml({
            name: s.client.full_name,
            date: s.session_date,
            time: s.start_time,
            type: s.session_type,
            notes: s.notes,
            settings,
          }),
        });
        if (ok) {
          reminders++;
          await db
            .from("cm_sessions")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", s.id);
        }
      }
    }

    // Same reminder for newborn-package orders (needs newborn_package_orders.reminder_sent_at, drizzle 0021).
    const { data: nb, error: nbErr } = await db
      .from("newborn_package_orders")
      .select("id, session_date, session_time, contact_name, contact_email, notes")
      .is("reminder_sent_at", null)
      .not("contact_email", "is", null)
      .gte("session_date", todayIL)
      .lte("session_date", horizonIL);
    if (nbErr) {
      console.error("[SWEETBABY] newborn reminder scan failed", nbErr);
    } else {
      for (const o of nb ?? []) {
        const time = (o.session_time ?? "10:00").slice(0, 5);
        const startMs = israelLocalToUtcMs(o.session_date, time);
        if (
          now.getTime() < startMs - settings.reminderHoursBefore * 3600_000 ||
          now.getTime() >= startMs
        )
          continue;
        const ok = await sendGmail({
          to: o.contact_email,
          subject: `תזכורת לצילום ניו בורן · ${formatDateIL(o.session_date)} בשעה ${time}`,
          html: reminderHtml({
            name: o.contact_name,
            date: o.session_date,
            time,
            type: "ניו בורן",
            notes: o.notes,
            settings,
          }),
        });
        if (ok) {
          reminders++;
          await db
            .from("newborn_package_orders")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", o.id);
        }
      }
    }
  }

  let dailySchedule = false;
  if (settings.dailyScheduleEnabled) {
    const p = israelParts(now);
    if (p.hour >= settings.dailyScheduleHour) {
      const { data: last } = await db
        .from("app_settings")
        .select("value")
        .eq("key", DAILY_LAST_SENT_KEY)
        .maybeSingle();
      if (last?.value !== p.date) {
        const [y, m, d] = p.date.split("-").map(Number);
        const t = new Date(Date.UTC(y, m - 1, d + 1));
        const tomorrow = t.toISOString().slice(0, 10);
        const { html, count } = await scheduleHtmlFor(db, tomorrow);
        // Mark first so a slow/failed send can't fire twice in one evening.
        await db.from("app_settings").upsert({
          key: DAILY_LAST_SENT_KEY,
          value: p.date,
          updated_at: new Date().toISOString(),
        });
        if (count > 0) {
          dailySchedule = await sendGmail({
            to: settings.scheduleEmail || "s0548529277@gmail.com",
            subject: `לו״ז צילומים למחר · ${formatDateIL(tomorrow)} (${count})`,
            html,
          });
        }
      }
    }
  }

  return { reminders, dailySchedule };
}

// Backs up customer data, balances, and finance records to Google Drive —
// one CSV per source table, uploaded into a dedicated "Sweetbaby - גיבוי
// נתונים" Drive folder, named with today's date so each day's backup is its
// own file (a history, not an overwrite — easiest to implement safely and
// most useful for a backup anyway). Raw per-table CSVs rather than the
// merged/processed view admin.finance.tsx renders — simpler, more robust,
// and better for a backup (preserves the real underlying rows).
import { toCSV } from "@/lib/csv";

const BACKUP_FOLDER = "Sweetbaby - גיבוי נתונים";
const LAST_BACKUP_SETTING_KEY = "last_data_backup_at";

async function fetchAll(supabaseAdmin: any, table: string, select: string) {
  const { data, error } = await supabaseAdmin.from(table).select(select);
  if (error) {
    console.error(`[SWEETBABY] backup fetch failed for ${table}`, error);
    return [];
  }
  return data ?? [];
}

/** The actual backup — fetches, builds CSVs, uploads to Drive. Never throws (best-effort, same spirit as every other background job in this app); returns what it managed to upload so the caller/admin UI can show real status. */
export async function runDataBackup(): Promise<{ ok: boolean; filesUploaded: string[]; error?: string }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { uploadTextFileToDrive } = await import("@/integrations/google/drive.server");

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filesUploaded: string[] = [];

    const [profiles, loyalty, orders, bookings, expenses, manualIncome] = await Promise.all([
      fetchAll(supabaseAdmin, "profiles", "id, full_name, phone, address, city, notes, created_at"),
      fetchAll(
        supabaseAdmin,
        "customer_loyalty",
        "user_id, credit_balance, cashback_credit_balance, manual_credit_balance, cashback_percent, fixed_discount_percent, custom_hourly_rate, cashback_expires_at",
      ),
      fetchAll(
        supabaseAdmin,
        "orders",
        "id, user_id, contact_name, contact_phone, total, status, session_date, return_date, deposit_status, cashback_awarded, created_at",
      ),
      fetchAll(
        supabaseAdmin,
        "bookings",
        "id, user_id, contact_name, contact_phone, price, status, session_date, start_time, end_time, package, deposit_status, cashback_awarded, created_at",
      ),
      fetchAll(supabaseAdmin, "expenses", "*"),
      fetchAll(supabaseAdmin, "manual_income", "*"),
    ]);

    const loyaltyByUser = new Map<string, any>(loyalty.map((l: any) => [l.user_id, l]));
    const clientRows = profiles.map((p: any) => {
      const l = loyaltyByUser.get(p.id) ?? {};
      return {
        id: p.id,
        full_name: p.full_name ?? "",
        phone: p.phone ?? "",
        address: p.address ?? "",
        city: p.city ?? "",
        notes: p.notes ?? "",
        credit_balance: l.credit_balance ?? 0,
        cashback_credit_balance: l.cashback_credit_balance ?? 0,
        manual_credit_balance: l.manual_credit_balance ?? 0,
        cashback_percent: l.cashback_percent ?? 0,
        fixed_discount_percent: l.fixed_discount_percent ?? 0,
        joined: p.created_at,
      };
    });

    const uploads: { filename: string; rows: any[]; headers: { key: string; label: string }[] }[] = [
      {
        filename: `לקוחות-${dateStamp}.csv`,
        rows: clientRows,
        headers: [
          { key: "full_name", label: "שם" },
          { key: "phone", label: "טלפון" },
          { key: "address", label: "כתובת" },
          { key: "city", label: "עיר" },
          { key: "notes", label: "הערות" },
          { key: "credit_balance", label: "יתרת קרדיט" },
          { key: "cashback_credit_balance", label: "קרדיט מקאשבק" },
          { key: "manual_credit_balance", label: "קרדיט ידני" },
          { key: "cashback_percent", label: "אחוז קאשבק" },
          { key: "fixed_discount_percent", label: "הנחה קבועה" },
          { key: "joined", label: "הצטרפות" },
        ],
      },
      {
        filename: `הזמנות-אביזרים-${dateStamp}.csv`,
        rows: orders,
        headers: [
          { key: "contact_name", label: "לקוחה" },
          { key: "contact_phone", label: "טלפון" },
          { key: "total", label: "סכום" },
          { key: "status", label: "סטטוס" },
          { key: "deposit_status", label: "סטטוס מקדמה" },
          { key: "cashback_awarded", label: "קאשבק שניתן" },
          { key: "session_date", label: "תאריך איסוף" },
          { key: "return_date", label: "תאריך החזרה" },
          { key: "created_at", label: "נוצר בתאריך" },
        ],
      },
      {
        filename: `הזמנות-סטודיו-${dateStamp}.csv`,
        rows: bookings,
        headers: [
          { key: "contact_name", label: "לקוחה" },
          { key: "contact_phone", label: "טלפון" },
          { key: "price", label: "מחיר" },
          { key: "status", label: "סטטוס" },
          { key: "deposit_status", label: "סטטוס מקדמה" },
          { key: "cashback_awarded", label: "קאשבק שניתן" },
          { key: "session_date", label: "תאריך" },
          { key: "start_time", label: "שעת התחלה" },
          { key: "end_time", label: "שעת סיום" },
          { key: "package", label: "חבילה" },
          { key: "created_at", label: "נוצר בתאריך" },
        ],
      },
      {
        filename: `הוצאות-${dateStamp}.csv`,
        rows: expenses,
        headers: Object.keys(expenses[0] ?? {}).map((k) => ({ key: k, label: k })),
      },
      {
        filename: `הכנסות-ידניות-${dateStamp}.csv`,
        rows: manualIncome,
        headers: Object.keys(manualIncome[0] ?? {}).map((k) => ({ key: k, label: k })),
      },
    ];

    for (const u of uploads) {
      if (u.rows.length === 0) continue;
      const csv = toCSV(u.rows, u.headers);
      await uploadTextFileToDrive(u.filename, csv, BACKUP_FOLDER);
      filesUploaded.push(u.filename);
    }

    await supabaseAdmin
      .from("app_settings")
      .upsert({ key: LAST_BACKUP_SETTING_KEY, value: new Date().toISOString() }, { onConflict: "key" });

    return { ok: true, filesUploaded };
  } catch (e: any) {
    console.error("[SWEETBABY] data backup failed", e);
    return { ok: false, filesUploaded: [], error: String(e?.message ?? e) };
  }
}

/** Called from the periodic reminder cron — runs the backup at most once per calendar day (Israel date), so a job that fires every 15-30 min doesn't re-upload dozens of times. */
export async function runDataBackupIfDue(): Promise<{ ran: boolean; result?: Awaited<ReturnType<typeof runDataBackup>> }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { israelNow } = await import("@/lib/availability.server");
    const todayKey = israelNow().date;
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", LAST_BACKUP_SETTING_KEY)
      .maybeSingle();
    const lastRunKey = data?.value ? String(data.value).slice(0, 10) : null;
    if (lastRunKey === todayKey) return { ran: false };
    const result = await runDataBackup();
    return { ran: true, result };
  } catch (e) {
    console.error("[SWEETBABY] runDataBackupIfDue failed", e);
    return { ran: false };
  }
}

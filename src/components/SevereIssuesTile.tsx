import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Extra "תקלה חמורה" checks for the admin home. Renders nothing while everything is fine.
 * 1) outgoing WhatsApp messages that failed in the last 3 days (e.g. Meta account locked)
 * 2) studio bookings for TODAY whose deposit is still unpaid
 */
export function SevereIssuesTile() {
  const wa = useQuery({
    queryKey: ["admin-severe-wa-failed"],
    queryFn: async () => {
      const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
      const { data } = await (supabase as any)
        .from("whatsapp_messages")
        .select("id, error, created_at")
        .eq("direction", "out")
        .eq("status", "failed")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as { id: string; error: string | null; created_at: string }[];
    },
    refetchInterval: 120_000,
  });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const unpaid = useQuery({
    queryKey: ["admin-severe-unpaid-today", today],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("bookings")
        .select("id, contact_name, start_time")
        .eq("session_date", today)
        .eq("deposit_status", "pending")
        .neq("status", "cancelled")
        .limit(20);
      return (data ?? []) as { id: string; contact_name: string | null; start_time: string | null }[];
    },
    refetchInterval: 120_000,
  });

  const failed = wa.data ?? [];
  const unpaidToday = unpaid.data ?? [];
  if (!failed.length && !unpaidToday.length) return null;

  return (
    <>
      {failed.length > 0 && (
        <Link to="/admin/whatsapp" className="block rounded-2xl border border-rose-200 bg-rose-50 text-rose-900 p-3 text-sm" dir="rtl">
          <span className="font-medium">🚨 תקלה חמורה · וואטסאפ</span> — {failed.length} הודעות יוצאות נכשלו ב-3 הימים האחרונים
          {failed[0].error ? <span className="opacity-80"> ({failed[0].error.slice(0, 80)})</span> : null}. לפתיחה
        </Link>
      )}
      {unpaidToday.length > 0 && (
        <Link to="/admin/orders" className="block rounded-2xl border border-rose-200 bg-rose-50 text-rose-900 p-3 text-sm" dir="rtl">
          <span className="font-medium">🚨 תקלה חמורה · מקדמה</span> — {unpaidToday.length} שריונות סטודיו להיום בלי מקדמה ששולמה:{" "}
          {unpaidToday.map((b) => `${b.contact_name ?? "ללא שם"} ${String(b.start_time ?? "").slice(0, 5)}`).join(", ")}
        </Link>
      )}
    </>
  );
}

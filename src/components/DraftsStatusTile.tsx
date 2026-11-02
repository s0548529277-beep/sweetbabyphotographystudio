import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Admin indicator for the automatic email-draft assistant
 * (written by email-drafts.server.ts into app_settings "email_drafts_status").
 * Shows: how long ago it last checked | drafts prepared today | automatic replies sent today.
 */
type DraftsStatus = {
  at?: string;
  created?: number;
  autoSent?: number;
  errors?: string[];
  reason?: string;
  today?: { date?: string; created?: number; autoSent?: number };
};

function minutesAgoLabel(iso?: string, now = Date.now()): string {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 1) return "הרגע";
  if (mins === 1) return "לפני דקה";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return "לפני שעה";
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "לפני יום" : `לפני ${days} ימים`;
}

export function DraftsStatusTile() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const status = useQuery({
    queryKey: ["admin-email-drafts-status"],
    queryFn: async (): Promise<DraftsStatus | null> => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", "email_drafts_status")
        .maybeSingle();
      try {
        return data?.value ? (JSON.parse(data.value) as DraftsStatus) : null;
      } catch {
        return null;
      }
    },
    refetchInterval: 60_000,
  });

  const s = status.data;
  if (!s) return null;

  const todayKey = new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const isToday = s.today?.date === todayKey;
  const createdToday = isToday ? s.today?.created ?? 0 : 0;
  const autoToday = isToday ? s.today?.autoSent ?? 0 : 0;
  const hasProblem = !!s.errors?.length || s.reason === "no_gmail";

  return (
    <div
      className={`rounded-2xl border p-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1 ${
        hasProblem ? "border-rose-200 bg-rose-50 text-rose-900" : "border-primary/10 bg-card text-forest/80"
      }`}
    >
      <span className="font-medium">✍️ עוזר הטיוטות</span>
      <span title={s.at ? new Date(s.at).toLocaleString("he-IL") : undefined}>
        בדיקה אחרונה: {minutesAgoLabel(s.at, now)}
      </span>
      {s.reason === "no_gmail" ? (
        <span>אין חשבון ג׳ימייל מחובר לאתר</span>
      ) : (
        <>
          <span>הוכנו היום {createdToday} טיוטות</span>
          {autoToday > 0 && <span>נשלחו היום {autoToday} מענים אוטומטיים</span>}
          {s.errors?.length ? (
            <span title={s.errors.join("\n")}>תקלות בבדיקה האחרונה: {s.errors.length}</span>
          ) : (
            <span>בלי תקלות</span>
          )}
        </>
      )}
    </div>
  );
}

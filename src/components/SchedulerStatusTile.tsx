import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";

/** Warns when the external scheduler (which sends reminders, thank-you mails and prepares email drafts) has not called /api/send-booking-reminders recently. Silent while healthy. */
const STALE_MINUTES = 20;

export function SchedulerStatusTile() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const q = useQuery({
    queryKey: ["admin-scheduler-last-run"],
    queryFn: async (): Promise<string | null> => {
      const { data } = await (supabase as any).from("app_settings").select("value").eq("key", "scheduler_last_run").maybeSingle();
      return data?.value ?? null;
    },
    refetchInterval: 60_000,
  });

  if (q.isLoading) return null;
  const last = q.data ? new Date(q.data).getTime() : null;
  const minutes = last ? Math.round((now - last) / 60_000) : null;
  if (minutes != null && minutes <= STALE_MINUTES) return null;

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-900 p-3 text-sm flex items-center gap-2" dir="rtl">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        {minutes == null
          ? "עוד לא נרשמה ריצה של התזמון האוטומטי — תזכורות, מיילי תודה וטיוטות לא יישלחו עד שהוא ירוץ."
          : `התזמון האוטומטי לא רץ כבר ${minutes} דקות — תזכורות, מיילי תודה וטיוטות מתעכבים. צריך לבדוק את המתזמן החיצוני (קריאה כל 10 דקות ל-/api/send-booking-reminders).`}
      </span>
    </div>
  );
}

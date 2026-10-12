import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Cloud, Loader2, CheckCircle2 } from "lucide-react";
import { getBackupConfigStatus, runManualBackup } from "@/lib/admin-backup.functions";

export const Route = createFileRoute("/_authenticated/admin/backup")({
  component: BackupAdmin,
});

function BackupAdmin() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getBackupConfigStatus);
  const doBackup = useServerFn(runManualBackup);
  const status = useQuery({ queryKey: ["backup-status"], queryFn: () => fetchStatus({}) });
  const [running, setRunning] = useState(false);

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await doBackup({});
      if (res.ok) {
        toast.success(`הגיבוי הסתיים — ${res.filesUploaded.length} קבצים הועלו ל-Drive`);
      } else {
        toast.error(res.error ?? "הגיבוי נכשל");
      }
      qc.invalidateQueries({ queryKey: ["backup-status"] });
    } catch (e: any) {
      toast.error(e?.message ?? "הגיבוי נכשל");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Cloud className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-2xl text-primary">גיבוי נתונים</h2>
          <p className="text-sm text-muted-foreground">
            גיבוי יומי אוטומטי (וגם ידני בלחיצה) של נתוני לקוחות, יתרות, הזמנות, הוצאות והכנסות —
            ל-Google Drive, כקבצי אקסל נפרדים לפי יום בתיקייה "Sweetbaby - גיבוי נתונים".
          </p>
        </div>
      </div>

      {status.data && !status.data.configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-900 space-y-2">
          <p className="font-semibold">Google Drive עדיין לא מחובר</p>
          <p>
            כדי להפעיל, חברי את Google Drive דרך הגדרות הפרויקט ← Connectors ← Google Drive. זה חיבור
            נפרד מג'ימייל — חיבור ג'ימייל לבדו לא מספיק. לאחר החיבור, הגיבוי יתחיל לעבוד בלי הגדרות
            נוספות.
          </p>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-primary/5 p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" />
          גיבוי אחרון:{" "}
          {status.data?.lastBackupAt ? new Date(status.data.lastBackupAt).toLocaleString("he-IL") : "עדיין לא בוצע גיבוי"}
        </div>
        <button
          type="button"
          onClick={runNow}
          disabled={running || !status.data?.configured}
          className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
          {running ? "מגבה…" : "גיבוי עכשיו"}
        </button>
      </div>
    </div>
  );
}

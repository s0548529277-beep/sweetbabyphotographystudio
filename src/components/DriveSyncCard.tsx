import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Cloud, Copy, Loader2, Send } from "lucide-react";

/**
 * "גיבוי ושיתוף בדרייב" — per explicit request, serves both at once: a
 * button that backs up every final/edited image to the studio's own
 * Drive at full quality, and — once that's run at least once — a link she
 * can copy or email straight to the client as an alternative/extra way to
 * get the album, alongside the ZIP download the client gallery already
 * offers. Generic over `onSync`/`onSendLink` so both the main
 * photo_client_* flow (admin.photo-clients.$bookingId.tsx) and the
 * separate newborn-package flow (admin.newborn-packages.$orderId.tsx) can
 * share this one component with their own server functions underneath.
 */
export function DriveSyncCard({
  editedCount,
  driveFolderUrl,
  driveSyncedAt,
  onSync,
  onSendLink,
  onSynced,
}: {
  editedCount: number;
  driveFolderUrl: string | null;
  driveSyncedAt: string | null;
  onSync: () => Promise<{ uploaded: number; total: number }>;
  onSendLink: () => Promise<{ sentTo: string }>;
  onSynced: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await onSync();
      toast.success(`הועלו ${res.uploaded}/${res.total} תמונות לדרייב`);
      onSynced();
    } catch (e: any) {
      toast.error(e?.message ?? "הגיבוי לדרייב נכשל");
    } finally {
      setSyncing(false);
    }
  };

  const onCopyLink = () => {
    if (!driveFolderUrl) return;
    navigator.clipboard.writeText(driveFolderUrl).then(
      () => toast.success("הקישור הועתק"),
      () => toast.error("העתקה נכשלה"),
    );
  };

  const handleSendLink = async () => {
    setSending(true);
    try {
      const res = await onSendLink();
      toast.success(`הקישור נשלח ל-${res.sentTo}`);
    } catch (e: any) {
      toast.error(e?.message ?? "שליחת הקישור נכשלה");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Cloud className="h-4 w-4 text-primary shrink-0" />
        <h3 className="font-display text-lg text-primary">גיבוי ושיתוף בדרייב</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        מעלה את כל התמונות המעובדות (באיכות מלאה) לתיקייה פרטית בגוגל דרייב שלך — גם כגיבוי, וגם כדי לקבל קישור שאפשר לשתף עם הלקוחה כדרך נוספת/חלופית ל-ZIP שהיא מורידה בעצמה.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={handleSync} disabled={syncing || editedCount === 0} className="rounded-full gap-1.5">
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
          {syncing ? "מגבה..." : driveFolderUrl ? "סנכרון מחדש" : "גיבוי לדרייב"}
        </Button>
        {driveFolderUrl && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={onCopyLink} className="rounded-full gap-1.5">
              <Copy className="h-3.5 w-3.5" /> העתקת קישור
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleSendLink} disabled={sending} className="rounded-full gap-1.5">
              <Send className="h-3.5 w-3.5" /> {sending ? "שולח..." : "שליחת קישור ללקוחה"}
            </Button>
          </>
        )}
      </div>

      {editedCount === 0 && <p className="text-[11px] text-muted-foreground">יש להעלות קודם תמונות מעובדות כדי לגבות.</p>}
      {driveFolderUrl && (
        <p className="text-xs text-muted-foreground break-all">
          <a href={driveFolderUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            {driveFolderUrl}
          </a>
          {driveSyncedAt && <span className="block mt-0.5">עודכן לאחרונה: {new Date(driveSyncedAt).toLocaleString("he-IL")}</span>}
        </p>
      )}
    </div>
  );
}

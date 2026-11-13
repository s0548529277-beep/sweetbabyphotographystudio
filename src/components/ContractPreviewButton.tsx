import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * "תצוגה מקדימה" of a contract e-mail before it is sent: shows exactly what the client would get
 * (details filled in) and lists what is missing, without sending anything.
 */
export function ContractPreviewButton({
  load,
  className,
}: {
  load: () => Promise<{ html: string; missing: string[] }>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ html: string; missing: string[] } | null>(null);

  const show = async () => {
    setBusy(true);
    try {
      setResult(await load());
      setOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "לא ניתן להציג תצוגה מקדימה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        disabled={busy}
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-full border border-primary/15 px-3 h-7 text-xs hover:bg-cream disabled:opacity-60"
        }
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />} תצוגה מקדימה של החוזה
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col gap-3" dir="rtl">
          <DialogHeader>
            <DialogTitle>תצוגה מקדימה של החוזה (לא נשלח)</DialogTitle>
          </DialogHeader>
          {result && result.missing.length > 0 && (
            <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2">
              לא ניתן לשלוח עדיין — חסר: {result.missing.join(", ")}
            </p>
          )}
          {result && result.html ? (
            <iframe title="תצוגה מקדימה של החוזה" srcDoc={result.html} className="w-full flex-1 min-h-[60vh] rounded-xl border bg-white" />
          ) : (
            <p className="text-sm text-muted-foreground">אי אפשר להציג תצוגה מקדימה לפני שנקבע תאריך צילום.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

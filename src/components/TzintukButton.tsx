import { useState } from "react";
import { PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendManualTzintuk } from "@/lib/tzintuk.functions";

/**
 * Admin-only manual tzintuk for photography clients (newborn / outdoor /
 * general). Automatic tzintuks are off; this is the one she chooses herself.
 */
export function TzintukButton({ phone, name }: { phone?: string | null; name?: string | null }) {
  const send = useServerFn(sendManualTzintuk);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!phone) return null;

  const run = async () => {
    setBusy(true);
    try {
      const r = await send({ data: { phone, name: name ?? undefined, message: message || undefined } });
      if (r.ok) {
        toast.success("הצינתוק נשלח");
        setOpen(false);
        setMessage("");
      } else toast.error("הצינתוק לא נשלח — פרטים בהתראות");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בשליחת צינתוק");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="rounded-full gap-1.5" onClick={() => setOpen(true)}>
        <PhoneCall className="h-4 w-4" /> צינתוק
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>צינתוק ל{name || "לקוחה"}</DialogTitle>
            <DialogDescription>
              הטלפון יצלצל פעם אחת ויתנתק, בלי הודעה. אם תכתבי הודעה — היא תושמע ללקוחה כשתחזור ותתקשר לקו.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="הודעה לשמיעה בחזרה (לא חובה)" rows={3} maxLength={400} />
          <Button type="button" onClick={run} disabled={busy} className="rounded-full">
            {busy ? "שולחת…" : "שליחת צינתוק"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Loader2, Lock, Unlock } from "lucide-react";

/**
 * "פתיחת כל התמונות ללא סימן מים" — per explicit request: the client's ZIP
 * of every raw proof photo at full quality, no watermark, is gated behind
 * a 150₪ add-on. Either she uploads a payment receipt (reviewed here) or
 * the admin pre-approves directly with no receipt at all (e.g. bundled
 * into a client's package) — same "approve" action either way. Generic
 * over `onGetReceiptUrl`/`onApprove` so both the main photo_client_* flow
 * and the separate newborn-package flow can share this one component with
 * their own server functions underneath (same pattern as DriveSyncCard).
 */
export function UnlockApprovalCard({
  unlocked,
  receiptSubmittedAt,
  onGetReceiptUrl,
  onApprove,
  onApproved,
}: {
  unlocked: boolean;
  receiptSubmittedAt: string | null;
  onGetReceiptUrl: () => Promise<{ url: string | null }>;
  onApprove: () => Promise<void>;
  onApproved: () => void;
}) {
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [approving, setApproving] = useState(false);

  const viewReceipt = async () => {
    setLoadingReceipt(true);
    try {
      const res = await onGetReceiptUrl();
      if (res.url) {
        setReceiptUrl(res.url);
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        toast.error("לא נמצאה אסמכתא");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "טעינת האסמכתא נכשלה");
    } finally {
      setLoadingReceipt(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await onApprove();
      toast.success("כל התמונות נפתחו ללקוחה");
      onApproved();
    } catch (e: any) {
      toast.error(e?.message ?? "הפתיחה נכשלה");
    } finally {
      setApproving(false);
    }
  };

  if (unlocked) {
    return (
      <div className="bg-card rounded-2xl border border-primary/10 p-5 flex items-center gap-2 text-sm text-primary font-medium">
        <Unlock className="h-4 w-4" /> כל התמונות ללא סימן מים פתוחות ללקוחה
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-primary shrink-0" />
        <h3 className="font-display text-lg text-primary">פתיחת כל התמונות ללא סימן מים</h3>
      </div>
      <p className="text-xs text-muted-foreground">תוספת 150₪ — נעולה עד שתאשרי (אם הלקוחה שלחה אסמכתא, או אם את מאשרת מראש בלי אסמכתא).</p>
      <div className="flex flex-wrap items-center gap-2">
        {receiptSubmittedAt ? (
          <Button type="button" size="sm" variant="outline" onClick={viewReceipt} disabled={loadingReceipt} className="rounded-full gap-1.5">
            {loadingReceipt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />} צפייה באסמכתא
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">עדיין לא נשלחה אסמכתא</span>
        )}
        <Button type="button" size="sm" onClick={handleApprove} disabled={approving} className="rounded-full gap-1.5">
          {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
          {receiptSubmittedAt ? "אישור ופתיחה" : "פתיחה מראש (בלי אסמכתא)"}
        </Button>
      </div>
      {receiptUrl && <p className="text-[11px] text-muted-foreground break-all">נפתח גם כאן: {receiptUrl}</p>}
    </div>
  );
}

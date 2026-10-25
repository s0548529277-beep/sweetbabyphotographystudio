// Shared "הורדת כל התמונות" block for the proof-selection gallery — per
// explicit request: a free ZIP of the (watermarked) display copies,
// always available, and a separate ZIP of the full-quality ORIGINALS with
// no watermark, gated behind a 150₪ add-on. The gate is either unlocked
// already (the admin approved it, with or without a receipt on file) or
// not — if not, this renders a small receipt-upload form instead of the
// download button. `onSubmitReceipt` is left to the caller because the
// actual upload mechanics differ: the main photo_client_* flow is an
// authenticated upload straight to Storage, while the token-only newborn
// flow (no Supabase session at all) has to go through a server function
// instead — this component only renders the UI/state, never touches
// Storage itself.
import { useState } from "react";
import { toast } from "sonner";
import { FileArchive, Loader2, Lock, Upload } from "lucide-react";
import { downloadPhotosAsZip, type ZipPhoto } from "@/lib/photo-zip";

export function AllPhotosUnlockPanel({
  displayPhotos,
  originalPhotos,
  zipBaseName,
  unlocked,
  receiptSubmittedAt,
  onSubmitReceipt,
  fetchPhotos,
  downloadsLeft,
  downloadLimit,
}: {
  displayPhotos: ZipPhoto[];
  originalPhotos: ZipPhoto[];
  zipBaseName: string;
  unlocked: boolean;
  receiptSubmittedAt: string | null;
  onSubmitReceipt: (file: File) => Promise<void>;
  /** When given, the photo list is fetched (and counted) on the server at click time instead of using the arrays above. */
  fetchPhotos?: (which: "display" | "originals") => Promise<ZipPhoto[]>;
  /** Shown to the client: how many ZIP downloads are left out of downloadLimit. */
  downloadsLeft?: number | null;
  downloadLimit?: number;
}) {
  const limited = downloadsLeft != null;
  const noneLeft = limited && downloadsLeft! <= 0;
  const [zippingWatermarked, setZippingWatermarked] = useState<{ done: number; total: number } | null>(null);
  const [zippingOriginals, setZippingOriginals] = useState<{ done: number; total: number } | null>(null);
  const [submittingReceipt, setSubmittingReceipt] = useState(false);

  const downloadWatermarked = async () => {
    setZippingWatermarked({ done: 0, total: displayPhotos.length });
    try {
      const photos = fetchPhotos ? await fetchPhotos("display") : displayPhotos;
      await downloadPhotosAsZip(photos, { watermark: false, zipName: `${zipBaseName}-עם-סימן-מים.zip`, onProgress: (done, total) => setZippingWatermarked({ done, total }) });
    } catch (e: any) {
      toast.error(e?.message ?? "ההורדה נכשלה");
    } finally {
      setZippingWatermarked(null);
    }
  };

  const downloadOriginals = async () => {
    setZippingOriginals({ done: 0, total: originalPhotos.length });
    try {
      const photos = fetchPhotos ? await fetchPhotos("originals") : originalPhotos;
      await downloadPhotosAsZip(photos, { watermark: false, zipName: `${zipBaseName}-איכות-מלאה.zip`, onProgress: (done, total) => setZippingOriginals({ done, total }) });
    } catch (e: any) {
      toast.error(e?.message ?? "ההורדה נכשלה");
    } finally {
      setZippingOriginals(null);
    }
  };

  const onFileChosen = async (file: File | null) => {
    if (!file) return;
    setSubmittingReceipt(true);
    try {
      await onSubmitReceipt(file);
      toast.success("האסמכתא נשלחה — נעדכן אותך ברגע שתאושר");
    } catch (e: any) {
      toast.error(e?.message ?? "שליחת האסמכתא נכשלה");
    } finally {
      setSubmittingReceipt(false);
    }
  };

  return (
    <div className="bg-primary/5 border border-primary/15 rounded-2xl p-4 space-y-3">
      {limited && (
        <p className={`text-center text-xs ${noneLeft ? "text-destructive font-medium" : "text-muted-foreground"}`}>
          {noneLeft
            ? `ניצלת את ${downloadLimit} ההורדות של קובץ ה-ZIP. לפתיחה מחדש אפשר לפנות אליי.`
            : `שימי לב: אפשר להוריד את קובץ התמונות (ZIP) עד ${downloadLimit} פעמים בלבד · נותרו ${downloadsLeft}`}
        </p>
      )}
      <button
        type="button"
        onClick={downloadWatermarked}
        disabled={!!zippingWatermarked || displayPhotos.length === 0 || noneLeft}
        className="w-full inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full bg-card border border-primary/20 text-sm font-semibold disabled:opacity-50"
      >
        {zippingWatermarked ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
        {zippingWatermarked ? `מכינה קובץ... ${zippingWatermarked.done}/${zippingWatermarked.total}` : "הורדת כל התמונות (ZIP)"}
      </button>

      {unlocked ? (
        <button
          type="button"
          onClick={downloadOriginals}
          disabled={!!zippingOriginals || originalPhotos.length === 0 || noneLeft}
          className="w-full inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {zippingOriginals ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
          {zippingOriginals ? `מכינה קובץ... ${zippingOriginals.done}/${zippingOriginals.total}` : "הורדת כל התמונות ללא סימן מים (ZIP)"}
        </button>
      ) : receiptSubmittedAt ? (
        <div className="text-center text-xs text-muted-foreground bg-card rounded-full py-2.5 px-4 flex items-center justify-center gap-1.5">
          <Lock className="h-3.5 w-3.5" /> האסמכתא נשלחה — ממתינה לאישור
        </div>
      ) : (
        <label className="w-full inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full border border-dashed border-primary/30 text-sm font-medium cursor-pointer hover:bg-primary/5 transition-colors">
          {submittingReceipt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {submittingReceipt ? "שולחת..." : "ללא סימן מים (תוספת 150₪) — העלאת אסמכתא תשלום"}
          <input type="file" accept="image/*,.pdf" className="hidden" disabled={submittingReceipt} onChange={(e) => onFileChosen(e.target.files?.[0] ?? null)} />
        </label>
      )}
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { applyWatermark } from "@/lib/watermark";
import { toast } from "sonner";
import { ArrowRight, Check, Copy, Droplet, ImagePlus, Loader2, Mail, Trash2 } from "lucide-react";
import {
  listNewbornOrders,
  listNewbornOrderImages,
  addNewbornOrderImage,
  deleteNewbornOrderImage,
  bulkDeleteNewbornOrderImages,
  adminToggleNewbornProofSelection,
  resendNewbornContract,
  updateNewbornPhotoSettings,
  updateNewbornOrderClientStep,
  syncNewbornAlbumToDrive,
  sendNewbornDriveAlbumLinkToClient,
  getNewbornUnlockReceiptUrl,
  approveNewbornAllPhotosUnlock,
} from "@/lib/newborn-orders.functions";
import { findNewbornPackage } from "@/lib/newborn-packages";
import { heError } from "@/lib/he-errors";
import { PhotoTriagePanel } from "@/components/PhotoTriagePanel";
import { DriveSyncCard } from "@/components/DriveSyncCard";
import { UnlockApprovalCard } from "@/components/UnlockApprovalCard";
import { StepTracker } from "@/components/StepTracker";
import { CLIENT_STEPS } from "@/lib/gallery-steps";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// A dedicated gallery-management page per newborn order — its own table
// (newborn_order_images), its own storage prefix, completely separate from
// the general photo_client_images system used elsewhere on the site, per
// explicit request. The client's own view of this same data is the
// unbranded, token-gated /newborn/gallery/$token page — this admin page
// just manages what she sees there.
export const Route = createFileRoute("/_authenticated/admin/newborn-packages/$orderId")({
  component: NewbornOrderGallery,
});

type ImageRow = { id: string; kind: "proof" | "edited"; image_url: string; selected: boolean; watermarked?: boolean };

// Same compression presets as admin.photo-clients.$bookingId.tsx — kept
// identical on purpose so the two upload UIs feel like one system.
const COMPRESSION_LEVELS = {
  none: { label: "ללא דחיסה (כבד, איכות מרבית)", maxDim: null as number | null, quality: 1 },
  light: { label: "קלה (מומלץ לתמונות גלם)", maxDim: 3200, quality: 0.92 },
  medium: { label: "בינונית (ברירת מחדל)", maxDim: 2400, quality: 0.85 },
  strong: { label: "חזקה (קובץ קטן, טעינה מהירה)", maxDim: 1600, quality: 0.75 },
} as const;
type CompressionLevel = keyof typeof COMPRESSION_LEVELS;

async function uploadToStorage(orderId: string, file: File): Promise<{ url: string; path: string }> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `newborn-orders/${orderId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("items").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage.from("items").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה בהעלאה");
  return { url: data.signedUrl, path };
}

function UploadSection({
  title,
  hint,
  kind,
  orderId,
  images,
  onChanged,
  onToggleSelect,
}: {
  title: string;
  hint: string;
  kind: "proof" | "edited";
  orderId: string;
  images: ImageRow[];
  onChanged: () => void;
  /** Only passed for the proofs section — lets the admin mark/unmark a favorite herself, e.g. when the client picked in person rather than through the gallery link. */
  onToggleSelect?: (imageId: string, selected: boolean) => void;
}) {
  const addImage = useServerFn(addNewbornOrderImage);
  const removeImage = useServerFn(deleteNewbornOrderImage);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [watermark, setWatermark] = useState(kind === "proof");
  const [compression, setCompression] = useState<CompressionLevel>(kind === "proof" ? "none" : "medium");
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: imageFiles.length });
    try {
      for (const file of imageFiles) {
        // The untouched original ALWAYS goes up too — the single source
        // the client's "download full quality" ZIP ever pulls from.
        const { url: originalUrl, path: originalPath } = await uploadToStorage(orderId, file);

        let displayFile = file;
        if (watermark) displayFile = await applyWatermark(displayFile);
        const level = COMPRESSION_LEVELS[compression];
        if (level.maxDim != null) displayFile = await compressImage(displayFile, level.maxDim, level.quality);
        const { url, path } = await uploadToStorage(orderId, displayFile);

        await addImage({
          data: { orderId, kind, url, storagePath: path, originalUrl, originalStoragePath: originalPath, watermarked: watermark },
        });
        setUploadProgress((p) => (p ? { done: p.done + 1, total: p.total } : p));
      }
      toast.success("התמונות הועלו");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "העלאה נכשלה");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDelete = async (id: string) => {
    try {
      await removeImage({ data: { id } });
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "מחיקה נכשלה");
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg text-primary">{title}</h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {images.length > 0 && <span className="text-xs text-muted-foreground shrink-0">תמונות ({images.length})</span>}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-primary/5 rounded-xl px-3 py-2.5">
        <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none">
          <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} className="accent-primary h-3.5 w-3.5" />
          <Droplet className="h-3.5 w-3.5 text-primary" /> סימן מים
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">דחיסה לתצוגה:</span>
          <Select value={compression} onValueChange={(v) => setCompression(v as CompressionLevel)}>
            <SelectTrigger className="h-7 text-xs w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(COMPRESSION_LEVELS) as [CompressionLevel, (typeof COMPRESSION_LEVELS)[CompressionLevel]][]).map(([key, c]) => (
                <SelectItem key={key} value={key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">הדחיסה משפיעה רק על עותק התצוגה — המקור באיכות מלאה תמיד נשמר בנפרד לצורך הורדת ה-ZIP.</p>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
        disabled={uploading}
        className={`w-full rounded-xl border-2 border-dashed p-5 flex items-center gap-3 text-right transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-primary/20 hover:border-primary/40"
        }`}
      >
        {uploading ? <Loader2 className="h-5 w-5 shrink-0 text-primary animate-spin" /> : <ImagePlus className="h-5 w-5 shrink-0 text-primary" />}
        <div className="min-w-0">
          <p className="text-sm font-medium">{uploading ? (uploadProgress ? `מעלה... ${uploadProgress.done}/${uploadProgress.total}` : "מעלה...") : "לחצי או גררי תמונות לכאן"}</p>
          <p className="text-xs text-muted-foreground">JPG, PNG, HEIC</p>
        </div>
      </button>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />

      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-2">
          {images.map((img, i) => (
            <div key={img.id} className="relative group aspect-square">
              <img src={img.image_url} alt="" className="w-full h-full object-cover rounded-lg border border-primary/10" />
              <span className="absolute bottom-1 right-1 bg-background/85 text-foreground text-[10px] font-mono px-1.5 py-0.5 rounded">{String(i + 1).padStart(3, "0")}</span>
              {img.watermarked && (
                <span className="absolute top-1 left-1 bg-background/85 text-primary rounded-full p-1" title="כולל סימן מים">
                  <Droplet className="h-3 w-3" />
                </span>
              )}
              {kind === "proof" && onToggleSelect && (
                <button
                  type="button"
                  onClick={() => onToggleSelect(img.id, !img.selected)}
                  className={`absolute top-1 right-1 rounded-full p-1 transition-colors ${
                    img.selected ? "bg-primary text-primary-foreground" : "bg-background/80 text-muted-foreground opacity-0 group-hover:opacity-100"
                  }`}
                  aria-label="סימון מועדפת"
                  title="סימון/ביטול כתמונה נבחרת"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(img.id)}
                className="absolute bottom-1 left-1 bg-background/90 rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                aria-label="מחיקה"
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Admin-editable selection settings — "מגבלת בחירה" + "מצב בחירה חכם", same fields/intent as PackageDetails in admin.photo-clients.$bookingId.tsx. */
function PhotoSettingsCard({ order, onSaved }: { order: any; onSaved: () => void }) {
  const [maxSelections, setMaxSelections] = useState(order.max_proof_selections != null ? String(order.max_proof_selections) : "");
  const [guided, setGuided] = useState(!!order.guided_selection_enabled);
  const [busy, setBusy] = useState(false);
  const save = useServerFn(updateNewbornPhotoSettings);

  useEffect(() => {
    setMaxSelections(order.max_proof_selections != null ? String(order.max_proof_selections) : "");
    setGuided(!!order.guided_selection_enabled);
  }, [order.max_proof_selections, order.guided_selection_enabled]);

  const onSave = async () => {
    setBusy(true);
    try {
      await save({ data: { id: order.id, maxProofSelections: maxSelections.trim() ? Number(maxSelections) : null, guidedSelectionEnabled: guided } });
      toast.success("הגדרות הבחירה נשמרו");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3">
      <h3 className="font-display text-lg text-primary">הגדרות בחירת תמונות</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">מגבלת בחירה ללקוחה</Label>
          <Input type="number" min={1} dir="ltr" value={maxSelections} onChange={(e) => setMaxSelections(e.target.value)} placeholder="ריק = בלי הגבלה" />
        </div>
        <div className="flex items-start gap-2 bg-primary/5 rounded-lg px-3 py-2.5">
          <input type="checkbox" id="newbornGuided" checked={guided} onChange={(e) => setGuided(e.target.checked)} className="accent-primary h-4 w-4 mt-0.5" />
          <label htmlFor="newbornGuided" className="text-xs cursor-pointer select-none">
            <span className="font-medium">מצב בחירה חכם</span> — בחירה חופשית קודם, ואז צמצום לכמות הנכונה.
          </label>
        </div>
      </div>
      <Button type="button" size="sm" onClick={onSave} disabled={busy} className="rounded-full">
        {busy ? "שומר..." : "שמירת הגדרות"}
      </Button>
    </div>
  );
}

function NewbornOrderGallery() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const listImages = useServerFn(listNewbornOrderImages);
  const listOrders = useServerFn(listNewbornOrders);
  const resendContract = useServerFn(resendNewbornContract);
  const bulkDeleteImages = useServerFn(bulkDeleteNewbornOrderImages);
  const syncDrive = useServerFn(syncNewbornAlbumToDrive);
  const sendDriveLink = useServerFn(sendNewbornDriveAlbumLinkToClient);
  const getReceiptUrl = useServerFn(getNewbornUnlockReceiptUrl);
  const approveUnlock = useServerFn(approveNewbornAllPhotosUnlock);
  const setClientStep = useServerFn(updateNewbornOrderClientStep);
  const adminToggleSelect = useServerFn(adminToggleNewbornProofSelection);
  const [resending, setResending] = useState(false);

  // The order list is already fetched on the main admin page — reused here
  // (same query key) rather than adding a dedicated "get one order" fn.
  const ordersQuery = useQuery({ queryKey: ["newborn-orders"], queryFn: () => listOrders({}) });
  const order = (ordersQuery.data ?? []).find((o: any) => o.id === orderId);

  const imagesQuery = useQuery({
    queryKey: ["newborn-order-images", orderId],
    queryFn: () => listImages({ data: { orderId } }),
  });
  const images = (imagesQuery.data ?? []) as ImageRow[];
  const refresh = () => qc.invalidateQueries({ queryKey: ["newborn-order-images", orderId] });
  const refreshOrder = () => qc.invalidateQueries({ queryKey: ["newborn-orders"] });

  const proofImages = images.filter((i) => i.kind === "proof");
  const editedImages = images.filter((i) => i.kind === "edited");

  const onDeleteTrashedProofs = async (ids: string[]) => {
    await bulkDeleteImages({ data: { ids } });
    refresh();
  };

  const onToggleSelect = async (imageId: string, selected: boolean) => {
    try {
      await adminToggleSelect({ data: { imageId, selected } });
      refresh();
    } catch (e) {
      toast.error(heError(e, "העדכון נכשל"));
    }
  };

  const shareUrl = order?.access_token ? `https://sweetbabyphoto.shop/newborn/gallery/${order.access_token}` : null;

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(
      () => toast.success("הקישור הועתק"),
      () => toast.error("ההעתקה נכשלה"),
    );
  };

  const onClientStepClick = async (step: number) => {
    try {
      await setClientStep({ data: { id: orderId, clientStep: step } });
      refreshOrder();
    } catch (e: any) {
      toast.error(e?.message ?? "העדכון נכשל");
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await resendContract({ data: { id: orderId } });
      if (res.ok) toast.success("החוזה נשלח מחדש");
      else toast.error("שליחת החוזה נכשלה");
    } catch (e: any) {
      toast.error(e?.message ?? "שליחת החוזה נכשלה");
    } finally {
      setResending(false);
    }
  };

  if (ordersQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">טוען...</div>;
  }
  if (!order) {
    return <div className="p-6 text-sm text-muted-foreground">ההזמנה לא נמצאה.</div>;
  }

  const pkg = findNewbornPackage(order.package_id);

  return (
    <div dir="rtl" className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link to="/admin/newborn-packages" className="h-9 w-9 rounded-full hover:bg-primary/10 flex items-center justify-center text-primary">
          <ArrowRight className="h-4 w-4" />
        </Link>
        <div>
          <h2 className="font-display text-2xl text-primary">{order.contact_name}</h2>
          <p className="text-sm text-muted-foreground">
            {pkg?.name ?? order.package_id} · ₪{order.total_price}
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-primary/10 p-5">
        <p className="text-xs font-semibold text-[#5a3a33] mb-3">התקדמות הלקוחה</p>
        <StepTracker theme="pink" steps={CLIENT_STEPS} current={order.client_step ?? 1} onStepClick={onClientStepClick} />
      </div>

      <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3">
        <h3 className="font-display text-lg text-primary">קישור אישי ללקוחה</h3>
        <p className="text-xs text-muted-foreground">הקישור הזה — ולא כניסה לאתר — הוא מה שהלקוחה משתמשת בו כדי לראות ולבחור תמונות. אין צורך שיהיה לה חשבון.</p>
        {shareUrl && (
          <div className="flex flex-wrap items-center gap-2">
            <code dir="ltr" className="text-xs bg-muted rounded-lg px-3 py-2 flex-1 min-w-0 truncate">
              {shareUrl}
            </code>
            <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 px-4 h-9 text-sm hover:bg-cream">
              <Copy className="h-3.5 w-3.5" /> העתקה
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          {order.contract_sent_at ? <span>חוזה נשלח ✓</span> : <span>החוזה עוד לא נשלח</span>}
          <button type="button" onClick={handleResend} disabled={resending} className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 px-3 h-7 hover:bg-cream disabled:opacity-60">
            {resending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} שליחה מחדש
          </button>
        </div>
        <p className="text-xs">
          {order.contract_confirmed_at ? <span className="text-primary font-medium">היא קראה ואישרה את החוזה ✓</span> : <span className="text-muted-foreground">עדיין לא אישרה שקראה את החוזה</span>}
        </p>
        {order.proofs_selected_at && <p className="text-xs text-primary font-medium">היא כבר סיימה לבחור תמונות ✓</p>}
      </div>

      <PhotoSettingsCard order={order} onSaved={refreshOrder} />

      {imagesQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">טוען תמונות...</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          <UploadSection
            title="תמונות לבחירה (עם סימן מים)"
            hint='הלקוחה בוחרת מתוכן, או שמסמנים כאן בשמה (ה-✓) אם היא בחרה בעצמה בטלפון/בפגישה.'
            kind="proof"
            orderId={orderId}
            images={proofImages}
            onChanged={refresh}
            onToggleSelect={onToggleSelect}
          />
          <UploadSection title="תמונות מעובדות (איכות סופית)" hint="ברגע שיש כאן תמונות, הלקוחה רואה אותן במקום תמונות הבחירה." kind="edited" orderId={orderId} images={editedImages} onChanged={refresh} />
        </div>
      )}

      {/* Only before the client has ever submitted her selection — once
          proofs_selected_at is set, bulk-deleting from this panel could
          wipe out her real picks (see the same gate in
          admin.photo-clients.$bookingId.tsx, added after a direct report). */}
      {proofImages.length > 0 && !order.proofs_selected_at && (
        <PhotoTriagePanel images={proofImages.map((i) => ({ id: i.id, url: i.image_url }))} onDeleteMany={onDeleteTrashedProofs} />
      )}

      {proofImages.length > 0 && (
        <UnlockApprovalCard
          unlocked={order.all_photos_unlocked ?? false}
          receiptSubmittedAt={order.unlock_receipt_submitted_at ?? null}
          onGetReceiptUrl={() => getReceiptUrl({ data: { orderId } })}
          onApprove={() => approveUnlock({ data: { orderId } }).then(() => {})}
          onApproved={refreshOrder}
        />
      )}

      <DriveSyncCard
        editedCount={editedImages.length}
        driveFolderUrl={order.drive_folder_url ?? null}
        driveSyncedAt={order.drive_synced_at ?? null}
        onSync={() => syncDrive({ data: { orderId } })}
        onSendLink={() => sendDriveLink({ data: { orderId } })}
        onSynced={refreshOrder}
      />
    </div>
  );
}

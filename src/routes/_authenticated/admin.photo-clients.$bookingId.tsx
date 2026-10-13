import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { applyWatermark } from "@/lib/watermark";
import {
  addPhotoClientImage,
  adminToggleProofSelection,
  advancePhotoClientStage,
  deletePhotoClientImage,
  bulkDeletePhotoClientImages,
  getPhotoClientDetail,
  updatePhotoClientDetails,
  sendPhotoClientContract,
  syncAlbumToDrive,
  sendDriveAlbumLinkToClient,
  getAllPhotosUnlockReceiptUrl,
  approveAllPhotosUnlock,
  STAGE_LABELS,
  WORKFLOW_STAGES,
  PHOTO_PACKAGES,
  type WorkflowStage,
  type PhotoPackageKey,
} from "@/lib/photo-clients.functions";
import { PhotoTriagePanel } from "@/components/PhotoTriagePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowRight, Check, Cloud, Copy, Droplet, ImagePlus, Loader2, Lock, Send, Trash2, Unlock } from "lucide-react";

// Compression presets for the DISPLAY copy shown in the gallery grid — the
// full-resolution original is always kept separately regardless of this
// choice (see uploadImage/UploadSection below), so picking a stronger level
// here only affects how heavy the on-screen browsing experience is, never
// what the client's final ZIP download contains.
const COMPRESSION_LEVELS = {
  none: { label: "ללא דחיסה (כבד, איכות מרבית)", maxDim: null as number | null, quality: 1 },
  light: { label: "קלה (מומלץ לתמונות גלם)", maxDim: 3200, quality: 0.92 },
  medium: { label: "בינונית (ברירת מחדל)", maxDim: 2400, quality: 0.85 },
  strong: { label: "חזקה (קובץ קטן, טעינה מהירה)", maxDim: 1600, quality: 0.75 },
} as const;
type CompressionLevel = keyof typeof COMPRESSION_LEVELS;

// Route param is still named "bookingId" (unchanged, so routeTree.gen.ts
// doesn't need regenerating) but it now carries a photo_client_workflows.id
// — a workflow may or may not be tied to an actual booking, see
// createPhotoClient in photo-clients.functions.ts.
export const Route = createFileRoute("/_authenticated/admin/photo-clients/$bookingId")({
  component: PhotoClientDetail,
});

type ImageRow = { id: string; kind: "proof" | "edited"; image_url: string; selected: boolean; watermarked?: boolean };

async function uploadImage(workflowId: string, file: File): Promise<{ url: string; path: string }> {
  const ext = file.name.split(".").pop();
  const path = `photo-clients/${workflowId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("items").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage.from("items").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה בהעלאה");
  return { url: data.signedUrl, path };
}

/** A gallery-style dropzone + numbered thumbnail grid (modeled on ChikTime's galleries screen) — drag files in or click to browse, each photo gets a sequential 001/002/... badge instead of an unlabeled grid. */
function UploadSection({
  title,
  hint,
  kind,
  workflowId,
  images,
  onChanged,
  onToggleSelect,
}: {
  title: string;
  hint: string;
  kind: "proof" | "edited";
  workflowId: string;
  images: ImageRow[];
  onChanged: () => void;
  /** Only passed for the proofs section — lets the admin mark/unmark a favorite herself (the "✓"), e.g. when the client picked in person rather than through /my-photos. */
  onToggleSelect?: (imageId: string, selected: boolean) => void;
}) {
  const addImage = useServerFn(addPhotoClientImage);
  const removeImage = useServerFn(deletePhotoClientImage);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Proofs default to watermarked (today's existing behavior, now a real
  // toggle instead of forced-on) and no extra compression beyond the full
  // original — she's shopping, so a crisp display copy matters. Edited
  // (final) uploads default to no watermark, medium compression — a lighter
  // browsing grid, with the full-quality original always kept regardless
  // for the ZIP download.
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
        // the client's "download full quality" ZIP ever pulls from,
        // regardless of what display settings were picked below.
        const { url: originalUrl, path: originalPath } = await uploadImage(workflowId, file);

        let displayFile = file;
        if (watermark) displayFile = await applyWatermark(displayFile);
        const level = COMPRESSION_LEVELS[compression];
        if (level.maxDim != null) displayFile = await compressImage(displayFile, level.maxDim, level.quality);
        const { url, path } = await uploadImage(workflowId, displayFile);

        await addImage({
          data: { workflowId, kind, storagePath: path, imageUrl: url, originalStoragePath: originalPath, originalImageUrl: originalUrl, watermarked: watermark },
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
      await removeImage({ data: { imageId: id } });
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

      {/* Upload-time choices — apply to the next batch dropped in below. The full-resolution original is always kept too, regardless of these. */}
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
      <p className="text-[11px] text-muted-foreground -mt-1">
        הדחיסה משפיעה רק על עותק התצוגה בגלריה — המקור באיכות מלאה תמיד נשמר בנפרד, וזה מה שיורד בהורדת ה-ZIP.
      </p>

      {/* Drop zone — drag files in, or click to browse. Plain HTML5 DnD, no library. */}
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
              <span className="absolute bottom-1 right-1 bg-background/85 text-foreground text-[10px] font-mono px-1.5 py-0.5 rounded">
                {String(i + 1).padStart(3, "0")}
              </span>
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

type PackageForm = {
  sessionDate: string;
  sessionTime: string;
  location: string;
  packageType: PhotoPackageKey | "";
  photosToEdit: string;
  albumUpgrades: string;
  totalPrice: string;
  amountPaid: string;
  maxProofSelections: string;
  guidedSelectionEnabled: boolean;
};

function toPackageForm(workflow: any): PackageForm {
  return {
    sessionDate: workflow.session_date ? String(workflow.session_date).slice(0, 10) : "",
    sessionTime: workflow.session_time ? String(workflow.session_time).slice(0, 5) : "",
    location: workflow.location ?? "",
    packageType: (workflow.package_type as PhotoPackageKey) ?? "",
    photosToEdit: workflow.photos_to_edit != null ? String(workflow.photos_to_edit) : "",
    albumUpgrades: workflow.album_upgrades ?? "",
    totalPrice: workflow.total_price != null ? String(workflow.total_price) : "",
    amountPaid: workflow.amount_paid != null ? String(workflow.amount_paid) : "0",
    maxProofSelections: workflow.max_proof_selections != null ? String(workflow.max_proof_selections) : "",
    guidedSelectionEnabled: !!workflow.guided_selection_enabled,
  };
}

/** Editable package/shoot-details panel — same fields as "לקוחה חדשה", for tweaking after the client card already exists. */
function PackageDetails({ workflow, workflowId, onSaved }: { workflow: any; workflowId: string; onSaved: () => void }) {
  const [form, setForm] = useState<PackageForm>(() => toPackageForm(workflow));
  const [busy, setBusy] = useState(false);
  const [sendingContract, setSendingContract] = useState(false);
  const updateDetails = useServerFn(updatePhotoClientDetails);
  const sendContractFn = useServerFn(sendPhotoClientContract);

  // Keep the form in sync if the workflow data refetches with different values.
  useEffect(() => setForm(toPackageForm(workflow)), [workflow]);

  const set = <K extends keyof PackageForm>(key: K, value: PackageForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const pickPackage = (key: PhotoPackageKey) => {
    const preset = PHOTO_PACKAGES[key];
    setForm((f) => ({
      ...f,
      packageType: key,
      photosToEdit: preset.photosToEdit != null ? String(preset.photosToEdit) : f.photosToEdit,
      albumUpgrades: preset.albumUpgrades || f.albumUpgrades,
    }));
  };

  const save = async () => {
    setBusy(true);
    try {
      await updateDetails({
        data: {
          workflowId,
          sessionDate: form.sessionDate || null,
          sessionTime: form.sessionTime || null,
          location: form.location.trim() || null,
          packageType: form.packageType || null,
          photosToEdit: form.photosToEdit.trim() ? Number(form.photosToEdit) : null,
          albumUpgrades: form.albumUpgrades.trim() || null,
          totalPrice: form.totalPrice.trim() ? Number(form.totalPrice) : null,
          amountPaid: form.amountPaid.trim() ? Number(form.amountPaid) : 0,
          maxProofSelections: form.maxProofSelections.trim() ? Number(form.maxProofSelections) : null,
          guidedSelectionEnabled: form.guidedSelectionEnabled,
        },
      });
      toast.success("פרטי החבילה נשמרו");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const sendContract = async () => {
    setSendingContract(true);
    try {
      const res = await sendContractFn({ data: { workflowId } });
      toast.success(`החוזה נשלח ל-${res.sentTo}`);
    } catch (e: any) {
      toast.error(e?.message ?? "שליחת החוזה נכשלה");
    } finally {
      setSendingContract(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3">
      <h3 className="font-display text-lg text-primary">פרטי חבילה וצילום</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">מועד צילומים</Label>
          <Input type="date" value={form.sessionDate} onChange={(e) => set("sessionDate", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">שעה</Label>
          <Input type="time" dir="ltr" value={form.sessionTime} onChange={(e) => set("sessionTime", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs text-muted-foreground">מיקום</Label>
          <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="סטודיו / חוץ / כתובת" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">סוג חבילה</Label>
          <Select value={form.packageType || undefined} onValueChange={(v) => pickPackage(v as PhotoPackageKey)}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="בחירת חבילה" />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(PHOTO_PACKAGES) as [PhotoPackageKey, (typeof PHOTO_PACKAGES)[PhotoPackageKey]][]).map(([key, p]) => (
                <SelectItem key={key} value={key}>
                  {p.label}
                  {p.price != null ? ` — ₪${p.price}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">כמות תמונות לעיבוד</Label>
          <Input type="number" min={0} dir="ltr" value={form.photosToEdit} onChange={(e) => set("photosToEdit", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">מגבלת בחירה ללקוחה</Label>
          <Input
            type="number"
            min={1}
            dir="ltr"
            value={form.maxProofSelections}
            onChange={(e) => set("maxProofSelections", e.target.value)}
            placeholder="ריק = בלי הגבלה"
          />
        </div>
        <div className="sm:col-span-2 flex items-start gap-2 bg-primary/5 rounded-lg px-3 py-2.5">
          <input
            type="checkbox"
            id="guidedSelection"
            checked={form.guidedSelectionEnabled}
            onChange={(e) => set("guidedSelectionEnabled", e.target.checked)}
            className="accent-primary h-4 w-4 mt-0.5"
          />
          <label htmlFor="guidedSelection" className="text-xs cursor-pointer select-none">
            <span className="font-medium">מצב בחירה חכם</span> — הלקוחה תבחר חופשי קודם, ואז תצמצם אחת אחת עד למגבלה (עדיף כשיש מגבלה מוגדרת). בלי זה: בחירה פשוטה, חסומה אוטומטית במגבלה.
          </label>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs text-muted-foreground">אלבום ושדרוגים</Label>
          <Input value={form.albumUpgrades} onChange={(e) => set("albumUpgrades", e.target.value)} placeholder="אלבום דיגיטלי, כריכת בוק, וכו׳" />
          <p className="text-[11px] text-muted-foreground mt-1">
            שדרוגים כלליים לעיון: כריכת זכוכית +₪150 · סט נוסף +₪350 · תמונה נוספת לעיבוד +₪40
          </p>
        </div>
      </div>

      {/* Payment fields are always entered by hand — never auto-filled from the package price. */}
      <div className="pt-3 border-t border-border grid sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">סכום כולל (₪)</Label>
          <Input type="number" min={0} dir="ltr" value={form.totalPrice} onChange={(e) => set("totalPrice", e.target.value)} placeholder="ריק = לא הוגדר" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">שולם עד כה (₪)</Label>
          <Input type="number" min={0} dir="ltr" value={form.amountPaid} onChange={(e) => set("amountPaid", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">יתרה פתוחה</Label>
          <div className="h-10 flex items-center font-display text-lg text-peach-deep" dir="ltr">
            {form.totalPrice.trim() ? `₪${(Number(form.totalPrice) - Number(form.amountPaid || 0)).toFixed(0)}` : "—"}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button type="button" size="sm" onClick={save} disabled={busy} className="rounded-full">
          {busy ? "שומר..." : "שמירת פרטים"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={sendContract} disabled={sendingContract} className="rounded-full gap-1.5">
          <Send className="h-3.5 w-3.5" /> {sendingContract ? "שולח..." : "שליחת חוזה ללקוחה"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        שולח את חוזה הצילומים המלא למייל הלקוחה (ולעותק אצלך), עם מועד הצילומים ופרטי החבילה שנשמרו למעלה. יש לשמור פרטים מעודכנים לפני השליחה.
      </p>
    </div>
  );
}

/** A connected segmented progress bar (like ChikTime's "בחירה — שליחה — העלאה — טיוט" tracker) instead of a row of separate pill buttons — same click-to-advance behavior, closer visual to the reference. */
function StageTracker({ stage, onSetStage }: { stage: WorkflowStage; onSetStage: (s: WorkflowStage) => void }) {
  const stageIndex = WORKFLOW_STAGES.indexOf(stage);
  return (
    <div className="bg-card rounded-2xl border border-primary/10 p-5">
      <div className="flex items-center">
        {WORKFLOW_STAGES.map((s, i) => (
          <div key={s} className="flex items-center flex-1 last:flex-initial">
            <button
              type="button"
              onClick={() => onSetStage(s)}
              className="flex flex-col items-center gap-1.5 shrink-0"
              title={STAGE_LABELS[s]}
            >
              <span
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  i < stageIndex
                    ? "bg-primary text-primary-foreground"
                    : i === stageIndex
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < stageIndex ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`text-[11px] whitespace-nowrap ${i === stageIndex ? "text-primary font-medium" : "text-muted-foreground"}`}>
                {STAGE_LABELS[s]}
              </span>
            </button>
            {i < WORKFLOW_STAGES.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 -mt-4 ${i < stageIndex ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        לוחצים על שלב כדי לעדכן את הסטטוס (למשל: "יום צילומים נקבע" אחרי תיאום עם הלקוחה, "אלבום פורסם" כדי לחשוף את התמונות המעובדות ללקוחה).
      </p>
    </div>
  );
}

/**
 * "גיבוי ושיתוף בדרייב" — per explicit request, serves both at once: a
 * button that backs up every edited (final) image to the studio's own
 * Drive at full quality, and — once that's run at least once — a link she
 * can copy or email straight to the client as an alternative/extra way to
 * get the album, alongside the ZIP download /my-photos already offers.
 */
function DriveSyncCard({ workflowId, editedCount, driveFolderUrl, driveSyncedAt, onSynced }: { workflowId: string; editedCount: number; driveFolderUrl: string | null; driveSyncedAt: string | null; onSynced: () => void }) {
  const syncFn = useServerFn(syncAlbumToDrive);
  const sendLinkFn = useServerFn(sendDriveAlbumLinkToClient);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);

  const onSync = async () => {
    setSyncing(true);
    try {
      const res = await syncFn({ data: { workflowId } });
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

  const onSendLink = async () => {
    setSending(true);
    try {
      const res = await sendLinkFn({ data: { workflowId } });
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
        <Button type="button" size="sm" onClick={onSync} disabled={syncing || editedCount === 0} className="rounded-full gap-1.5">
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
          {syncing ? "מגבה..." : driveFolderUrl ? "סנכרון מחדש" : "גיבוי לדרייב"}
        </Button>
        {driveFolderUrl && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={onCopyLink} className="rounded-full gap-1.5">
              <Copy className="h-3.5 w-3.5" /> העתקת קישור
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onSendLink} disabled={sending} className="rounded-full gap-1.5">
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

/**
 * "פתיחת כל התמונות ללא סימן מים" — per explicit request: the client's ZIP
 * of every raw proof photo at full quality, no watermark, is gated behind
 * a 150₪ add-on. Either she uploads a payment receipt (reviewed here) or
 * the admin pre-approves directly with no receipt at all (e.g. bundled
 * into a client's package) — same "approve" action either way.
 */
function UnlockApprovalCard({ workflowId, unlocked, receiptSubmittedAt, onApproved }: { workflowId: string; unlocked: boolean; receiptSubmittedAt: string | null; onApproved: () => void }) {
  const getReceiptUrl = useServerFn(getAllPhotosUnlockReceiptUrl);
  const approve = useServerFn(approveAllPhotosUnlock);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [approving, setApproving] = useState(false);

  const viewReceipt = async () => {
    setLoadingReceipt(true);
    try {
      const res = await getReceiptUrl({ data: { workflowId } });
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

  const onApprove = async () => {
    setApproving(true);
    try {
      await approve({ data: { workflowId } });
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
        <Button type="button" size="sm" onClick={onApprove} disabled={approving} className="rounded-full gap-1.5">
          {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
          {receiptSubmittedAt ? "אישור ופתיחה" : "פתיחה מראש (בלי אסמכתא)"}
        </Button>
      </div>
      {receiptUrl && <p className="text-[11px] text-muted-foreground break-all">נפתח גם כאן: {receiptUrl}</p>}
    </div>
  );
}

function PhotoClientDetail() {
  const { bookingId: workflowId } = Route.useParams();
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getPhotoClientDetail);
  const advanceStage = useServerFn(advancePhotoClientStage);
  const toggleSelect = useServerFn(adminToggleProofSelection);
  const bulkDeleteImages = useServerFn(bulkDeletePhotoClientImages);
  const detail = useQuery({ queryKey: ["photo-client", workflowId], queryFn: () => fetchDetail({ data: { workflowId } }) });

  const refetch = () => qc.invalidateQueries({ queryKey: ["photo-client", workflowId] });

  const onDeleteTrashedProofs = async (imageIds: string[]) => {
    await bulkDeleteImages({ data: { imageIds } });
    refetch();
  };

  const setStage = async (stage: WorkflowStage) => {
    try {
      await advanceStage({ data: { workflowId, stage } });
      toast.success("השלב עודכן");
      refetch();
      qc.invalidateQueries({ queryKey: ["photo-clients"] });
    } catch (e: any) {
      toast.error(e?.message ?? "העדכון נכשל");
    }
  };

  const onToggleSelect = async (imageId: string, selected: boolean) => {
    try {
      await toggleSelect({ data: { imageId, selected } });
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "העדכון נכשל");
    }
  };

  if (detail.isError) {
    return <p className="text-sm text-destructive">{(detail.error as any)?.message ?? "טעינת הלקוחה נכשלה"}</p>;
  }
  if (!detail.data) return <p className="text-sm text-muted-foreground">טוען...</p>;

  const { booking, workflow, images } = detail.data as any;
  const stage = workflow.stage as WorkflowStage;
  const proofImages = (images as ImageRow[]).filter((i) => i.kind === "proof");
  const editedImages = (images as ImageRow[]).filter((i) => i.kind === "edited");
  const selectedCount = proofImages.filter((i) => i.selected).length;
  const simpleDeliveryOnly = workflow.has_package === false && workflow.wants_editing === false;

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/admin/photo-clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
        <ArrowRight className="h-4 w-4" /> חזרה לרשימת לקוחות צילום
      </Link>

      <div>
        <h2 className="font-display text-xl text-primary">
          {booking.contact_name}
          {workflow.package_type && <span className="text-sm font-normal text-muted-foreground"> · {PHOTO_PACKAGES[workflow.package_type as PhotoPackageKey].label}</span>}
        </h2>
        <p className="text-sm text-muted-foreground" dir="ltr">
          {booking.contact_phone}{" "}
          {workflow.session_date
            ? `· ${workflow.session_date}${workflow.session_time ? ` ${String(workflow.session_time).slice(0, 5)}` : ""}`
            : "· אין מועד קבוע"}
          {workflow.location ? ` · ${workflow.location}` : ""}
        </p>
      </div>

      <PackageDetails workflow={workflow} workflowId={workflowId} onSaved={refetch} />

      {simpleDeliveryOnly ? (
        // Studio-only booking, no editing bought — nothing to progress
        // through (no proofs to pick from, no album stage). Just hand
        // her the photos; /my-photos already shows "edited" images as
        // final the moment the stage is album_published, which is where
        // createPhotoClient started this workflow.
        <>
          <UploadSection
            title="תמונות"
            hint="ללקוחה הזו אין תהליך עיבוד/בחירה — כל מה שמעלים כאן נראה לה מיד ב'התמונות שלי'."
            kind="edited"
            workflowId={workflowId}
            images={editedImages}
            onChanged={refetch}
          />
          <DriveSyncCard
            workflowId={workflowId}
            editedCount={editedImages.length}
            driveFolderUrl={workflow.drive_folder_url ?? null}
            driveSyncedAt={workflow.drive_synced_at ?? null}
            onSynced={refetch}
          />
        </>
      ) : (
        <>
          <StageTracker stage={stage} onSetStage={setStage} />

          <UploadSection
            title="תמונות גלם (Proofs)"
            hint='סימן המים והדחיסה נבחרים למעלה (ברירת מחדל: עם סימן מים, בלי דחיסה). הלקוחה תראה את אלה ותוכל לסמן מועדפות (או שמסמנים כאן בשמה, ב-✓) ברגע שהשלב יעודכן ל"המתנה לבחירת לקוחה".'
            kind="proof"
            workflowId={workflowId}
            images={proofImages}
            onChanged={refetch}
            onToggleSelect={onToggleSelect}
          />

          {/* Only before the client has ever had access to these proofs
              (booked/date_confirmed) — once she's seen them and may have
              started/finished picking favorites, this panel's bulk-delete
              operates on ALL proof images with no "already selected"
              distinction, so showing it past that point risks wiping out
              her real picks. Per a direct report confirming exactly this
              risk. */}
          {proofImages.length > 0 && (stage === "booked" || stage === "date_confirmed") && (
            <PhotoTriagePanel images={proofImages.map((i) => ({ id: i.id, url: i.image_url }))} onDeleteMany={onDeleteTrashedProofs} />
          )}

          {proofImages.length > 0 && (
            <UnlockApprovalCard
              workflowId={workflowId}
              unlocked={workflow.all_photos_unlocked ?? false}
              receiptSubmittedAt={workflow.unlock_receipt_submitted_at ?? null}
              onApproved={refetch}
            />
          )}

          {stage !== "booked" && stage !== "date_confirmed" && (
            <p className="text-sm text-muted-foreground -mt-3">
              {selectedCount > 0 ? (
                <>
                  <Check className="inline h-3.5 w-3.5 ml-1 text-primary" />
                  {selectedCount} תמונות מסומנות כמועדפות.
                </>
              ) : (
                "עדיין לא סומנו בחירות."
              )}
            </p>
          )}

          <UploadSection
            title="תמונות מעובדות"
            hint='טיוטה — הלקוחה לא רואה את אלה עד שמעדכנים את השלב ל"אלבום פורסם".'
            kind="edited"
            workflowId={workflowId}
            images={editedImages}
            onChanged={refetch}
          />

          <DriveSyncCard
            workflowId={workflowId}
            editedCount={editedImages.length}
            driveFolderUrl={workflow.drive_folder_url ?? null}
            driveSyncedAt={workflow.drive_synced_at ?? null}
            onSynced={refetch}
          />
        </>
      )}
    </div>
  );
}

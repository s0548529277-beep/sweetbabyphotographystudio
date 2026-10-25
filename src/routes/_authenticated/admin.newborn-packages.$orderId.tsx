import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { applyWatermark } from "@/lib/watermark";
import { toast } from "sonner";
import { ArrowRight, Check, Copy, Droplet, Eye, Images, ImagePlus, Loader2, Mail, MessageCircle, MessageSquareText, RotateCcw, Send, Trash2 } from "lucide-react";
import { NEWBORN_ZIP_DOWNLOAD_LIMIT, formatDateIL } from "@/lib/client-management";
import {
  listNewbornOrders,
  listNewbornOrderImages,
  addNewbornOrderImage,
  deleteNewbornOrderImage,
  bulkDeleteNewbornOrderImages,
  adminToggleNewbornProofSelection,
  resendNewbornContract,
  sendNewbornGalleryLinkByEmail,
  resetNewbornZipDownloads,
  updateNewbornPhotoSettings,
  updateNewbornOrderClientStep,
  updateNewbornAlbumDetails,
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
import { Textarea } from "@/components/ui/textarea";

// A dedicated gallery-management page per newborn order — its own table
// (newborn_order_images), its own storage prefix, completely separate from
// the general photo_client_images system used elsewhere on the site, per
// explicit request. The client's own view of this same data is the
// unbranded, token-gated /newborn/gallery/$token page — this admin page
// just manages what she sees there.
export const Route = createFileRoute("/_authenticated/admin/newborn-packages/$orderId")({
  component: NewbornOrderGallery,
});

type ImageRow = { id: string; kind: "proof" | "edited"; image_url: string; selected: boolean; watermarked?: boolean; file_name?: string | null; client_note?: string | null };

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
          data: { orderId, kind, url, storagePath: path, originalUrl, originalStoragePath: originalPath, watermarked: watermark, fileName: file.name },
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
              <span className="absolute bottom-1 right-1 max-w-[85%] truncate bg-background/85 text-foreground text-[10px] font-mono px-1.5 py-0.5 rounded" title={img.file_name ?? undefined}>
                {img.file_name ?? String(i + 1).padStart(3, "0")}
              </span>
              {img.client_note && (
                <span className="absolute inset-x-1 top-7 rounded bg-[#4a3221]/85 px-1.5 py-0.5 text-[10px] text-white" title={img.client_note}>
                  <MessageSquareText className="inline h-3 w-3" /> {img.client_note}
                </span>
              )}
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

const CAPTION_LANGUAGE_LABEL: Record<string, string> = { hebrew: "עברי", latin: "לועזי" };

/**
 * "פרטים לעיצוב האלבום" — read-only view of what the client filled in on
 * her own gallery page (submitNewbornAlbumDetailsByToken), with an edit
 * mode for when she dictates the details over the phone instead — same
 * "admin can act on the client's behalf" pattern as the proof-selection ✓
 * button above.
 */
function AlbumDetailsCard({ order, onSaved }: { order: any; onSaved: () => void }) {
  const save = useServerFn(updateNewbornAlbumDetails);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    childName: order.album_child_name ?? "",
    birthWeight: order.album_birth_weight ?? "",
    birthTime: order.album_birth_time ?? "",
    birthDate: order.album_birth_date ?? "",
    hospital: order.album_hospital ?? "",
    captionLanguage: order.album_caption_language ?? "",
    notes: order.album_notes ?? "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({
      childName: order.album_child_name ?? "",
      birthWeight: order.album_birth_weight ?? "",
      birthTime: order.album_birth_time ?? "",
      birthDate: order.album_birth_date ?? "",
      hospital: order.album_hospital ?? "",
      captionLanguage: order.album_caption_language ?? "",
      notes: order.album_notes ?? "",
    });
  }, [order.album_child_name, order.album_birth_weight, order.album_birth_time, order.album_birth_date, order.album_hospital, order.album_caption_language, order.album_notes]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const onSave = async () => {
    setBusy(true);
    try {
      await save({ data: { id: order.id, ...form } });
      toast.success("הפרטים נשמרו");
      setEditing(false);
      onSaved();
    } catch (e) {
      toast.error(heError(e, "השמירה נכשלה"));
    } finally {
      setBusy(false);
    }
  };

  const hasAnyDetails = !!order.album_details_submitted_at;

  return (
    <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-lg text-primary">פרטים לעיצוב האלבום</h3>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary hover:underline shrink-0">
            {hasAnyDetails ? "עריכה" : "הזנה ידנית"}
          </button>
        )}
      </div>

      {!editing ? (
        hasAnyDetails ? (
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <p><span className="text-muted-foreground">שם הילד/ה:</span> {order.album_child_name || "—"}</p>
            <p><span className="text-muted-foreground">משקל לידה:</span> {order.album_birth_weight || "—"}</p>
            <p><span className="text-muted-foreground">שעת לידה:</span> {order.album_birth_time || "—"}</p>
            <p><span className="text-muted-foreground">תאריך לידה:</span> {order.album_birth_date || "—"}</p>
            <p><span className="text-muted-foreground">בית חולים:</span> {order.album_hospital || "—"}</p>
            <p><span className="text-muted-foreground">כיתוב:</span> {CAPTION_LANGUAGE_LABEL[order.album_caption_language] ?? "—"}</p>
            {order.album_notes && <p className="sm:col-span-2"><span className="text-muted-foreground">הערות:</span> {order.album_notes}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">הלקוחה עדיין לא שלחה פרטים — יתקבלו אוטומטית אחרי שתסיים לבחור תמונות, או אפשר למלא כאן בעצמך.</p>
        )
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">שם הילד/ה</Label>
              <Input value={form.childName} onChange={(e) => set("childName", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">משקל לידה</Label>
              <Input value={form.birthWeight} onChange={(e) => set("birthWeight", e.target.value)} placeholder='לדוגמה: 3.200 ק"ג' />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">שעת לידה</Label>
              <Input value={form.birthTime} onChange={(e) => set("birthTime", e.target.value)} placeholder="לדוגמה: 14:30" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">תאריך לידה</Label>
              <Input type="date" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground">בית חולים</Label>
              <Input value={form.hospital} onChange={(e) => set("hospital", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">כיתוב</Label>
              <Select value={form.captionLanguage || undefined} onValueChange={(v) => set("captionLanguage", v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="בחירה" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hebrew">עברי</SelectItem>
                  <SelectItem value="latin">לועזי</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">הערות</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={onSave} disabled={busy} className="rounded-full">
              {busy ? "שומר..." : "שמירה"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} className="rounded-full">
              ביטול
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Numbered section heading — groups the page into a clear "what stage, what to do" narrative instead of one long undifferentiated stack of cards, per explicit request for a more understandable layout. */
function SectionHeader({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3 pt-2">
      <span className="h-7 w-7 shrink-0 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center">{step}</span>
      <div>
        <h2 className="font-display text-lg text-primary leading-tight">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

/** "0" → "972" Israeli country code, digits only — wa.me takes no "+" and no leading zero. */
function toWhatsAppDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

/**
 * The actual "send to client" action — per direct report, there was no
 * button to send the gallery link, only a copyable text box she had to
 * find and paste herself. Now offers WhatsApp (opens pre-filled, she hits
 * send herself — no server round trip needed) and email (sendNewbornGalleryLinkByEmail)
 * alongside the existing copy option, plus the contract status/resend that
 * used to live in a separate card further up the page.
 */
function ShareLinkCard({
  shareUrl,
  contactName,
  contactPhone,
  contractSentAt,
  contractConfirmedAt,
  proofsSelectedAt,
  orderId,
  resending,
  onResend,
  order,
  onChanged,
}: {
  order: any;
  onChanged: () => void;
  shareUrl: string | null;
  contactName: string;
  contactPhone: string;
  contractSentAt: string | null;
  contractConfirmedAt: string | null;
  proofsSelectedAt: string | null;
  orderId: string;
  resending: boolean;
  onResend: () => void;
}) {
  const sendEmailFn = useServerFn(sendNewbornGalleryLinkByEmail);
  const resetDownloads = useServerFn(resetNewbornZipDownloads);
  const [sendingEmail, setSendingEmail] = useState(false);

  // One click: WhatsApp opens first (must be synchronous, or the browser blocks the popup), then the email goes out.
  const sendBoth = async () => {
    sendWhatsApp();
    if (order.contact_email) await sendEmail();
    else toast.message("נפתח וואטסאפ — ללקוחה אין מייל, אז לא נשלח מייל");
    onChanged();
  };

  const onResetDownloads = async () => {
    try {
      await resetDownloads({ data: { orderId } });
      toast.success("ההורדות נפתחו מחדש ללקוחה");
      onChanged();
    } catch (e) {
      toast.error(heError(e, "העדכון נכשל"));
    }
  };

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(
      () => toast.success("הקישור הועתק"),
      () => toast.error("ההעתקה נכשלה"),
    );
  };

  const sendEmail = async () => {
    setSendingEmail(true);
    try {
      const res = await sendEmailFn({ data: { orderId } });
      toast.success(`הקישור נשלח ל-${res.sentTo}`);
    } catch (e) {
      toast.error(heError(e, "שליחת המייל נכשלה"));
    } finally {
      setSendingEmail(false);
    }
  };

  const sendWhatsApp = () => {
    if (!shareUrl) return;
    const text = `היי ${contactName} 💗 התמונות שלך מוכנות לבחירה: ${shareUrl}`;
    window.open(`https://wa.me/${toWhatsAppDigits(contactPhone)}?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/15 p-5 space-y-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Images className="h-4 w-4 text-primary shrink-0" />
        <h3 className="font-display text-lg text-primary">שליחת הגלריה ללקוחה</h3>
      </div>
      <p className="text-xs text-muted-foreground">הקישור הזה — ולא כניסה לאתר — הוא מה שהלקוחה משתמשת בו כדי לראות ולבחור תמונות. אין צורך שיהיה לה חשבון.</p>
      {shareUrl && (
        <code dir="ltr" className="block text-xs bg-muted rounded-lg px-3 py-2 truncate">
          {shareUrl}
        </code>
      )}
      <Button type="button" onClick={sendBoth} disabled={!shareUrl || sendingEmail} className="w-full rounded-full gap-1.5">
        {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} שליחה בלחיצה אחת — מייל + וואטסאפ
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={sendWhatsApp} disabled={!shareUrl} className="rounded-full gap-1.5 bg-[#25D366] hover:bg-[#1ebe5a] text-white">
          <MessageCircle className="h-3.5 w-3.5" /> שליחה בוואטסאפ
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={sendEmail} disabled={sendingEmail || !shareUrl} className="rounded-full gap-1.5">
          {sendingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} שליחה במייל
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={copyLink} disabled={!shareUrl} className="rounded-full gap-1.5">
          <Copy className="h-3.5 w-3.5" /> העתקת קישור
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border text-xs text-muted-foreground">
        {contractSentAt ? <span>חוזה נשלח ✓</span> : <span>החוזה עוד לא נשלח</span>}
        <button type="button" onClick={onResend} disabled={resending} className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 px-3 h-7 hover:bg-cream disabled:opacity-60">
          {resending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} שליחה מחדש
        </button>
        {contractConfirmedAt ? <span className="text-primary font-medium">אישרה שקראה את החוזה ✓</span> : <span>עדיין לא אישרה שקראה את החוזה</span>}
        {proofsSelectedAt && <span className="text-primary font-medium">סיימה לבחור תמונות ✓</span>}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{order.gallery_sent_at ? `הגלריה נשלחה במייל ${formatDateIL(String(order.gallery_sent_at).slice(0, 10))}` : "הגלריה עוד לא נשלחה במייל"}</span>
        <span className={order.client_viewed_at ? "text-primary font-medium" : ""}>
          <Eye className="inline h-3 w-3" /> {order.client_viewed_at ? "הלקוחה פתחה את הגלריה ✓" : "עוד לא פתחה את הגלריה"}
        </span>
        {Number(order.extra_photos_count ?? 0) > 0 && <span className="text-primary font-medium">נבחרו {order.extra_photos_count} תמונות נוספות (נוסף לחשבון)</span>}
        <span>
          הורדות ZIP: בחירה {order.proofs_zip_downloads ?? 0}/{NEWBORN_ZIP_DOWNLOAD_LIMIT} · אלבום {order.edited_zip_downloads ?? 0}/{NEWBORN_ZIP_DOWNLOAD_LIMIT}
        </span>
        {(Number(order.proofs_zip_downloads ?? 0) > 0 || Number(order.edited_zip_downloads ?? 0) > 0) && (
          <button type="button" onClick={onResetDownloads} className="inline-flex items-center gap-1 rounded-full border border-primary/15 px-2.5 h-6 hover:bg-cream">
            <RotateCcw className="h-3 w-3" /> פתיחת הורדות מחדש
          </button>
        )}
      </div>
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

      <SectionHeader step={1} title="תמונות לבחירה ללקוחה" hint="מעלים כאן, שולחים לה את הקישור, והיא בוחרת מועדפות." />
      <ShareLinkCard
        shareUrl={shareUrl}
        contactName={order.contact_name}
        contactPhone={order.contact_phone}
        contractSentAt={order.contract_sent_at ?? null}
        contractConfirmedAt={order.contract_confirmed_at ?? null}
        proofsSelectedAt={order.proofs_selected_at ?? null}
        orderId={orderId}
        resending={resending}
        onResend={handleResend}
        order={order}
        onChanged={refreshOrder}
      />

      {imagesQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">טוען תמונות...</div>
      ) : (
        <UploadSection
          title="תמונות לבחירה (עם סימן מים)"
          hint='הלקוחה בוחרת מתוכן, או שמסמנים כאן בשמה (ה-✓) אם היא בחרה בעצמה בטלפון/בפגישה.'
          kind="proof"
          orderId={orderId}
          images={proofImages}
          onChanged={refresh}
          onToggleSelect={onToggleSelect}
        />
      )}

      {/* Only before the client has ever submitted her selection — once
          proofs_selected_at is set, bulk-deleting from this panel could
          wipe out her real picks (see the same gate in
          admin.photo-clients.$bookingId.tsx, added after a direct report). */}
      {proofImages.length > 0 && !order.proofs_selected_at && (
        <PhotoTriagePanel images={proofImages.map((i) => ({ id: i.id, url: i.image_url }))} onDeleteMany={onDeleteTrashedProofs} />
      )}

      <PhotoSettingsCard order={order} onSaved={refreshOrder} />

      {proofImages.length > 0 && (
        <UnlockApprovalCard
          unlocked={order.all_photos_unlocked ?? false}
          receiptSubmittedAt={order.unlock_receipt_submitted_at ?? null}
          onGetReceiptUrl={() => getReceiptUrl({ data: { orderId } })}
          onApprove={() => approveUnlock({ data: { orderId } }).then(() => {})}
          onApproved={refreshOrder}
        />
      )}

      <SectionHeader step={2} title="פרטים לעיצוב האלבום" hint="מתקבל אוטומטית אחרי שהיא בוחרת, או שממלאים כאן ידנית." />
      <AlbumDetailsCard order={order} onSaved={refreshOrder} />

      <SectionHeader step={3} title="אלבום סופי ומסירה" hint="מעלים את התמונות המעובדות — היא רואה אותן במקום תמונות הבחירה." />
      {imagesQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">טוען תמונות...</div>
      ) : (
        <UploadSection title="תמונות מעובדות (איכות סופית)" hint="ברגע שיש כאן תמונות, הלקוחה רואה אותן במקום תמונות הבחירה." kind="edited" orderId={orderId} images={editedImages} onChanged={refresh} />
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

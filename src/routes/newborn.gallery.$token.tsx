import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Heart, Check, Download, FileArchive, Loader2, SendHorizonal, X } from "lucide-react";
import {
  getNewbornGalleryByToken,
  toggleNewbornProofByToken,
  finishNewbornProofSelectionByToken,
  submitNewbornUnlockReceiptByToken,
  submitNewbornAlbumDetailsByToken,
} from "@/lib/newborn-orders.functions";
import { downloadPhotosAsZip } from "@/lib/photo-zip";
import { PhotoLightbox, GuidedStepper } from "@/components/PhotoLightbox";
import { AllPhotosUnlockPanel } from "@/components/AllPhotosUnlockPanel";
import { StepTracker } from "@/components/StepTracker";
import { CLIENT_STEPS } from "@/lib/gallery-steps";
import michalLogoWordmark from "@/assets/michal-logo-wordmark.png";

/** Reads a File as base64 (no data: prefix) — needed because submitNewbornUnlockReceiptByToken has to carry the file over as a plain server-fn argument (a newborn visitor has no Supabase session for a direct authenticated Storage upload, see that function's own doc comment). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("קריאת הקובץ נכשלה"));
    reader.readAsDataURL(file);
  });
}

// The client-facing gallery for Michal's own newborn-photography business —
// per explicit request, a completely separate surface from the general
// site's photo-client system: no login, no Sweetbaby branding, reachable
// only via a private link (the token in the URL) mailed to the client.
// Shows watermarked proofs to pick from, or — once she's uploaded them —
// the final full-quality edited photos instead. Mirrors my-photos.tsx's
// feature set (lightbox zoom, opt-in guided two-phase selection, ZIP
// download) while keeping this page's own distinct look.
export const Route = createFileRoute("/newborn/gallery/$token")({
  head: () => ({
    meta: [{ title: "התמונות שלך | מיכל סיבוני" }, { name: "robots", content: "noindex" }],
  }),
  component: NewbornGalleryPage,
});

type Img = { id: string; kind: "proof" | "edited"; image_url: string; original_image_url: string | null; selected: boolean };

type AlbumDetails = {
  childName: string | null;
  birthWeight: string | null;
  birthTime: string | null;
  birthDate: string | null;
  hospital: string | null;
  captionLanguage: "hebrew" | "latin" | null;
  notes: string | null;
  submittedAt: string | null;
};

/**
 * "פרטים לעיצוב האלבום" — shown right after the client finishes picking her
 * proof photos (CLIENT_STEPS step 3). Not locked after submitting — she can
 * reopen and correct a detail (e.g. the baby's name) any time.
 */
function AlbumDetailsForm({ token, details, onSaved }: { token: string; details: AlbumDetails; onSaved: () => void }) {
  const submitFn = useServerFn(submitNewbornAlbumDetailsByToken);
  const [editing, setEditing] = useState(!details.submittedAt);
  const [form, setForm] = useState({
    childName: details.childName ?? "",
    birthWeight: details.birthWeight ?? "",
    birthTime: details.birthTime ?? "",
    birthDate: details.birthDate ?? "",
    hospital: details.hospital ?? "",
    captionLanguage: details.captionLanguage ?? ("" as "" | "hebrew" | "latin"),
    notes: details.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await submitFn({
        data: {
          token,
          childName: form.childName,
          birthWeight: form.birthWeight,
          birthTime: form.birthTime,
          birthDate: form.birthDate,
          hospital: form.hospital,
          ...(form.captionLanguage ? { captionLanguage: form.captionLanguage } : {}),
          notes: form.notes,
        },
      });
      toast.success("הפרטים נשלחו אליי — תודה! 💗");
      setEditing(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "השליחה נכשלה, נסי שוב");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full rounded-xl border border-[#4a3221]/15 bg-white px-3.5 py-2.5 text-sm text-[#4a3221] placeholder:text-[#4a3221]/40 focus:outline-none focus:ring-2 focus:ring-[#4a3221]/25";
  const labelClass = "text-xs font-medium text-[#4a3221]/70 mb-1 block";

  if (!editing) {
    return (
      <div className="mt-6 rounded-2xl border border-[#4a3221]/10 bg-white/60 p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-lg" style={{ fontFamily: "'DM Serif Display', serif" }}>
            פרטים לעיצוב האלבום
          </h3>
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-[#4a3221]/70 hover:text-[#4a3221] underline shrink-0">
            עריכת הפרטים
          </button>
        </div>
        <p className="text-sm text-[#4a3221] flex items-center gap-1.5">
          <Check className="h-4 w-4 shrink-0" /> תודה, קיבלנו את הפרטים — מתחילים לעצב 💗
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-[#4a3221]/10 bg-white/60 p-5 space-y-4">
      <div>
        <h3 className="text-lg" style={{ fontFamily: "'DM Serif Display', serif" }}>
          פרטים לעיצוב האלבום
        </h3>
        <p className="text-xs text-[#4a3221]/70 mt-1">כמה פרטים קטנים שעוזרים לי לעצב לך אלבום מדויק ואישי.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>שם הילד/ה</label>
          <input className={inputClass} value={form.childName} onChange={(e) => set("childName", e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>משקל לידה</label>
          <input className={inputClass} value={form.birthWeight} onChange={(e) => set("birthWeight", e.target.value)} placeholder='לדוגמה: 3.200 ק"ג' />
        </div>
        <div>
          <label className={labelClass}>שעת לידה</label>
          <input className={inputClass} value={form.birthTime} onChange={(e) => set("birthTime", e.target.value)} placeholder="לדוגמה: 14:30" />
        </div>
        <div>
          <label className={labelClass}>תאריך לידה</label>
          <input type="date" className={inputClass} value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>בית חולים</label>
          <input className={inputClass} value={form.hospital} onChange={(e) => set("hospital", e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelClass}>העדפת כיתוב באלבום</label>
        <div className="flex gap-2">
          {(
            [
              { key: "hebrew", label: "עברי" },
              { key: "latin", label: "לועזי" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => set("captionLanguage", opt.key)}
              className={`flex-1 h-10 rounded-xl border text-sm font-medium transition-colors ${
                form.captionLanguage === opt.key ? "border-[#4a3221] bg-[#4a3221] text-white" : "border-[#4a3221]/15 text-[#4a3221]/70 hover:border-[#4a3221]/40"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelClass}>הערות</label>
        <textarea className={inputClass} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-2 bg-[#4a3221] text-white px-6 py-3 rounded-full font-semibold disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
        שליחת הפרטים
      </button>
    </div>
  );
}

function ProofSection({
  proofs,
  token,
  maxProofSelections,
  guidedSelectionEnabled,
  proofsSelectedAt,
  allPhotosUnlocked,
  unlockReceiptSubmittedAt,
  contactName,
  onRefetch,
}: {
  proofs: Img[];
  token: string;
  maxProofSelections: number | null;
  guidedSelectionEnabled: boolean;
  proofsSelectedAt: string | null;
  allPhotosUnlocked: boolean;
  unlockReceiptSubmittedAt: string | null;
  contactName: string;
  onRefetch: () => void;
}) {
  const toggleProof = useServerFn(toggleNewbornProofByToken);
  const finishSelection = useServerFn(finishNewbornProofSelectionByToken);
  const submitUnlockReceipt = useServerFn(submitNewbornUnlockReceiptByToken);
  const [finishing, setFinishing] = useState(false);
  const [phase, setPhase] = useState<"browse" | "narrow">("browse");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const submitted = !!proofsSelectedAt;
  const limit = maxProofSelections;
  const selectedImages = proofs.filter((i) => i.selected);
  const selectedCount = selectedImages.length;
  const overLimit = limit != null && selectedCount > limit;
  const atLimit = limit != null && selectedCount >= limit;
  const visibleImages = phase === "narrow" ? selectedImages : proofs;

  useEffect(() => {
    if (phase === "narrow" && selectedCount === 0) setPhase("browse");
  }, [phase, selectedCount]);

  const toggle = async (img: Img) => {
    if (submitted) return;
    if (!guidedSelectionEnabled && !img.selected && atLimit) {
      toast.error(`אפשר לבחור עד ${limit} תמונות`);
      return;
    }
    try {
      await toggleProof({ data: { token, imageId: img.id, selected: !img.selected } });
      onRefetch();
    } catch (e: any) {
      toast.error(e?.message ?? "העדכון נכשל, נסי שוב");
    }
  };

  const finish = async () => {
    if (selectedCount === 0) {
      toast.error("נא לבחור לפחות תמונה אחת");
      return;
    }
    setFinishing(true);
    try {
      await finishSelection({ data: { token } });
      onRefetch();
      toast.success("תודה! הבחירה שלך נשלחה אליי 💗");
    } catch (e: any) {
      toast.error(e?.message ?? "משהו השתבש, נסי שוב");
    } finally {
      setFinishing(false);
    }
  };

  const onSubmitUnlockReceipt = async (file: File) => {
    const fileBase64 = await fileToBase64(file);
    await submitUnlockReceipt({ data: { token, fileBase64, fileName: file.name, contentType: file.type || "application/octet-stream" } });
    onRefetch();
  };

  return (
    <>
      {guidedSelectionEnabled && !submitted && (
        <div className="mb-4 space-y-1.5">
          <GuidedStepper phase={phase} />
          <p className="text-xs text-[#4a3221]/70">
            {phase === "browse" ? "שלב 1: סמני לב על כל תמונה שאהבת — אין הגבלה בשלב הזה." : `שלב 2: הסירי תמונות אחת אחת עד שנשארות בדיוק ${limit ?? ""} התמונות שלך.`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {visibleImages.map((img, i) => (
          <div key={img.id} className="relative aspect-square overflow-hidden rounded-2xl bg-[#f5d5cf] group">
            <img src={img.image_url} alt="" loading="lazy" className="w-full h-full object-cover cursor-zoom-in" onClick={() => setLightboxIndex(i)} />
            <button
              type="button"
              onClick={() => toggle(img)}
              disabled={submitted}
              className={`absolute top-2 left-2 h-10 w-10 rounded-full flex items-center justify-center transition disabled:opacity-60 ${
                phase === "narrow" ? "bg-destructive text-white" : img.selected ? "bg-[#4a3221] text-white" : "bg-white/80 text-[#4a3221] hover:bg-white"
              }`}
            >
              {phase === "narrow" ? <X className="h-4 w-4" /> : <Heart className={`h-4 w-4 ${img.selected ? "fill-current" : ""}`} />}
            </button>
          </div>
        ))}
      </div>

      {lightboxIndex != null && (
        <PhotoLightbox
          images={visibleImages.map((i) => ({ id: i.id, url: i.image_url }))}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          renderActions={
            submitted
              ? undefined
              : (lbImg) => {
                  const full = proofs.find((i) => i.id === lbImg.id);
                  if (!full) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => toggle(full)}
                      className={`inline-flex items-center gap-1.5 h-10 px-5 rounded-full text-sm font-semibold ${
                        phase === "narrow" ? "bg-destructive text-white" : full.selected ? "bg-[#4a3221] text-white" : "bg-white/15 text-white"
                      }`}
                    >
                      {phase === "narrow" ? <X className="h-4 w-4" /> : <Heart className={`h-4 w-4 ${full.selected ? "fill-current" : ""}`} />}
                      {phase === "narrow" ? "הסרה מהנבחרות" : full.selected ? "הוסרה מהמועדפות" : "הוספה למועדפות"}
                    </button>
                  );
                }
          }
        />
      )}

      <div className="mt-6">
        <AllPhotosUnlockPanel
          displayPhotos={proofs.map((img, i) => ({ url: img.image_url, name: `${String(i + 1).padStart(3, "0")}.jpg` }))}
          originalPhotos={proofs.map((img, i) => ({ url: img.original_image_url || img.image_url, name: `${String(i + 1).padStart(3, "0")}.jpg` }))}
          zipBaseName={contactName || "תמונות"}
          unlocked={allPhotosUnlocked}
          receiptSubmittedAt={unlockReceiptSubmittedAt}
          onSubmitReceipt={onSubmitUnlockReceipt}
        />
      </div>

      <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
        {submitted ? (
          <span className="text-[#4a3221] font-medium flex items-center gap-1.5">
            <Check className="h-4 w-4" /> הבחירה נשלחה — {selectedCount} תמונות
          </span>
        ) : (
          <>
            <span className="text-sm text-[#4a3221]/70">
              {overLimit ? (
                <span className="text-destructive font-medium">
                  יש להסיר עוד {selectedCount - (limit ?? 0)} כדי להגיע ל-{limit}
                </span>
              ) : (
                <>
                  {selectedCount}
                  {limit != null ? ` / ${limit}` : ""} נבחרו
                </>
              )}
            </span>
            {guidedSelectionEnabled && phase === "narrow" && (
              <button type="button" onClick={() => setPhase("browse")} className="text-xs text-[#4a3221]/70 hover:text-[#4a3221] underline">
                ← חזרה לכל התמונות
              </button>
            )}
            {guidedSelectionEnabled && phase === "browse" ? (
              <button
                type="button"
                onClick={() => setPhase("narrow")}
                disabled={selectedCount === 0}
                className="inline-flex items-center gap-2 bg-[#4a3221] text-white px-6 py-3 rounded-full font-semibold disabled:opacity-60"
              >
                המשך לצמצום ←
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                disabled={finishing || overLimit}
                className="inline-flex items-center gap-2 bg-[#4a3221] text-white px-8 py-3.5 rounded-full font-semibold disabled:opacity-60"
              >
                {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                סיימתי לבחור ({selectedCount})
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}

function EditedSection({ edited, contactName }: { edited: Img[]; contactName: string }) {
  const [watermark, setWatermark] = useState(false);
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const onDownloadZip = async () => {
    setZipping({ done: 0, total: edited.length });
    try {
      const photos = edited.map((img, i) => ({ url: img.original_image_url || img.image_url, name: `${String(i + 1).padStart(3, "0")}.jpg` }));
      await downloadPhotosAsZip(photos, { watermark, zipName: `${contactName || "האלבום-שלי"}.zip`, onProgress: (done, total) => setZipping({ done, total }) });
    } catch (e: any) {
      toast.error(e?.message ?? "הורדת האלבום נכשלה");
    } finally {
      setZipping(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 bg-[#d9b98a]/15 border border-[#d9b98a]/30 rounded-2xl px-4 py-3 mb-4">
        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none text-[#4a3221]">
          <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} className="accent-[#4a3221] h-4 w-4" />
          עם סימן מים
        </label>
        <button
          type="button"
          onClick={onDownloadZip}
          disabled={!!zipping}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#4a3221] text-white text-sm font-semibold disabled:opacity-50"
        >
          {zipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
          {zipping ? `מכינה קובץ... ${zipping.done}/${zipping.total}` : "הורדת כל האלבום (ZIP, איכות מלאה)"}
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {edited.map((img, i) => (
          <div key={img.id} className="relative aspect-square overflow-hidden rounded-2xl bg-[#f5d5cf] group">
            <img src={img.image_url} alt="" loading="lazy" className="w-full h-full object-cover cursor-zoom-in" onClick={() => setLightboxIndex(i)} />
            <a
              href={img.original_image_url || img.image_url}
              download
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-2 left-2 h-8 w-8 rounded-full bg-white/85 text-[#4a3221] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              aria-label="הורדה"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
        ))}
      </div>
      {lightboxIndex != null && (
        <PhotoLightbox
          images={edited.map((i) => ({ id: i.id, url: i.original_image_url || i.image_url }))}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          renderActions={(img) => (
            <a href={img.url} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-white/15 text-white text-sm font-semibold">
              <Download className="h-4 w-4" /> הורדה (איכות מלאה)
            </a>
          )}
        />
      )}
    </>
  );
}

function NewbornGalleryPage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const getGallery = useServerFn(getNewbornGalleryByToken);

  const query = useQuery({
    queryKey: ["newborn-gallery-token", token],
    queryFn: () => getGallery({ data: { token } }),
    retry: false,
  });
  const onRefetch = () => qc.invalidateQueries({ queryKey: ["newborn-gallery-token", token] });

  if (query.isLoading) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#fdf3ec] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#8a6338]" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#fdf3ec] flex items-center justify-center px-6 text-center">
        <div>
          <Link to="/">
            <img src={michalLogoWordmark} alt="michal" className="h-10 mx-auto mb-4" />
          </Link>
          <p className="text-[#4a3221]">הקישור לא תקין או שפג תוקפו. אפשר לפנות אליי ישירות ואשלח קישור חדש.</p>
        </div>
      </div>
    );
  }

  const { contactName, packageName, images, proofsSelectedAt, maxProofSelections, guidedSelectionEnabled, allPhotosUnlocked, unlockReceiptSubmittedAt, clientStep, albumDetails } = query.data as {
    contactName: string;
    packageName: string;
    images: Img[];
    proofsSelectedAt: string | null;
    maxProofSelections: number | null;
    guidedSelectionEnabled: boolean;
    allPhotosUnlocked: boolean;
    unlockReceiptSubmittedAt: string | null;
    clientStep: number;
    albumDetails: AlbumDetails;
  };
  const edited = images.filter((i) => i.kind === "edited");
  const proofs = images.filter((i) => i.kind === "proof");
  const showEdited = edited.length > 0;
  const showingCount = showEdited ? edited.length : proofs.length;

  return (
    <div dir="rtl" className="min-h-screen bg-[#fdf3ec] text-[#4a3221]" style={{ fontFamily: "'Fira Sans', sans-serif" }}>
      <header className="border-b border-[#4a3221]/10 bg-[#fdf3ec]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/">
            <img src={michalLogoWordmark} alt="michal" className="h-10 w-auto" />
          </Link>
          <div className="text-sm text-[#4a3221]/70">{contactName}</div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="bg-white/60 border border-[#4a3221]/10 rounded-2xl p-4 mb-8">
          <StepTracker theme="pink" steps={CLIENT_STEPS} current={clientStep ?? 1} />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>
            {showEdited ? "התמונות המוכנות שלך 💗" : "בואי נבחר תמונות"}
          </h1>
          <p className="text-sm text-[#4a3221]/70">
            {showEdited ? packageName : proofsSelectedAt ? "כבר שלחת לי את הבחירה שלך — תודה!" : `לוחצים על התמונה להגדלה, ועל הלב לבחור — ${packageName}`}
          </p>
        </div>

        {showingCount === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#4a3221]/20 p-12 text-center text-sm text-[#4a3221]/70">
            עדיין לא הועלו תמונות — אעדכן אותך במייל ברגע שהן יהיו מוכנות 💗
          </div>
        ) : showEdited ? (
          <EditedSection edited={edited} contactName={contactName} />
        ) : (
          <ProofSection
            proofs={proofs}
            token={token}
            maxProofSelections={maxProofSelections}
            guidedSelectionEnabled={guidedSelectionEnabled}
            proofsSelectedAt={proofsSelectedAt}
            allPhotosUnlocked={allPhotosUnlocked}
            unlockReceiptSubmittedAt={unlockReceiptSubmittedAt}
            contactName={contactName}
            onRefetch={onRefetch}
          />
        )}

        {proofsSelectedAt && <AlbumDetailsForm token={token} details={albumDetails} onSaved={onRefetch} />}
      </div>
    </div>
  );
}

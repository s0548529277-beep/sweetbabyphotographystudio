import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getMyPhotoGalleries, toggleProofSelection, submitProofSelection, type WorkflowStage } from "@/lib/photo-clients.functions";
import { downloadPhotosAsZip } from "@/lib/photo-zip";
import { toast } from "sonner";
import { Camera, Check, ChevronLeft, ChevronRight, Download, FileArchive, Heart, Loader2, SendHorizonal, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/my-photos")({
  component: MyPhotosPage,
  head: () => ({ meta: [{ title: "התמונות שלי | Sweetbaby" }, { name: "robots", content: "noindex, nofollow" }] }),
});

type Img = { id: string; kind: "proof" | "edited"; image_url: string; original_image_url?: string | null; selected: boolean };
// booking is null for a workflow the admin started manually, with no
// underlying package='photography' booking (see startManualPhotoWorkflow).
type Gallery = {
  id: string;
  booking: { id: string; session_date: string; contact_name: string } | null;
  stage: WorkflowStage;
  images: Img[];
  max_proof_selections: number | null;
  proof_selection_submitted_at: string | null;
  guided_selection_enabled: boolean;
};

const STAGE_MESSAGE: Record<WorkflowStage, string> = {
  booked: "השריון והמקדמה התקבלו — עדיין אין תמונות להצגה.",
  date_confirmed: "יום הצילומים נקבע 📅 התמונות יעלו לכאן אחרי הצילום.",
  proofs_ready: "התמונות מוכנות! תבחרי את המועדפות עלייך — לחיצה על התמונה מגדילה אותה, לחיצה על הלב מסמנת/מבטלת בחירה.",
  edited_uploaded: "התמונות שנבחרו נמצאות כרגע בעריכה.",
  album_published: "האלבום הסופי שלך מוכן 💗",
};

/**
 * Full-screen photo viewer — shared by both the proof-selection grid and
 * the final album grid, per explicit request that zooming in be available
 * everywhere. Click/tap the image to toggle between fit-to-screen and a
 * larger (pannable, via native scroll) zoomed view; arrow buttons, swipe,
 * and the keyboard arrows move between photos. `renderActions` lets each
 * caller add its own bottom-bar button (favorite/remove for proofs,
 * download for the final album) without this component knowing about
 * selection or downloads itself.
 */
function Lightbox({
  images,
  startIndex,
  onClose,
  renderActions,
}: {
  images: { id: string; url: string }[];
  startIndex: number;
  onClose: () => void;
  renderActions?: (img: { id: string; url: string }, index: number) => React.ReactNode;
}) {
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const go = (delta: number) => {
    setIndex((i) => Math.max(0, Math.min(images.length - 1, i + delta)));
    setZoomed(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  useEffect(() => {
    if (index >= images.length) setIndex(Math.max(0, images.length - 1));
  }, [images.length, index]);

  const img = images[index];
  if (!img) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(dx) > 50) go(dx > 0 ? -1 : 1);
        touchStartX.current = null;
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white/90 text-sm shrink-0">
        <span dir="ltr">
          {index + 1} / {images.length}
        </span>
        <button type="button" onClick={onClose} className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center" aria-label="סגירה">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-auto flex items-center justify-center" onClick={() => setZoomed((z) => !z)}>
        {index > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center z-10"
            aria-label="התמונה הקודמת"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {index < images.length - 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center z-10"
            aria-label="התמונה הבאה"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
        <img
          src={img.url}
          alt=""
          className={zoomed ? "cursor-zoom-out" : "max-w-full max-h-[75vh] object-contain cursor-zoom-in"}
          style={zoomed ? { width: "200%", maxWidth: "none" } : undefined}
        />
      </div>

      {renderActions && <div className="px-4 py-3 flex items-center justify-center gap-3 shrink-0">{renderActions(img, index)}</div>}
      <p className="text-center text-[11px] text-white/50 pb-2 shrink-0">הקישי על התמונה להגדלה</p>
    </div>
  );
}

/** The opt-in "smart" flow's 2-step indicator — browse (free selection) then narrow (down to the limit). Only rendered when the admin turned guided_selection_enabled on for this client. */
function GuidedStepper({ phase }: { phase: "browse" | "narrow" }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium ${phase === "browse" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
        <span className="h-4 w-4 rounded-full bg-white/25 flex items-center justify-center text-[10px]">1</span> בחירה חופשית
      </span>
      <div className="h-px w-4 bg-primary/30" />
      <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium ${phase === "narrow" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        <span className="h-4 w-4 rounded-full bg-white/25 flex items-center justify-center text-[10px]">2</span> צמצום לכמות הנכונה
      </span>
    </div>
  );
}

function ProofGrid({ gallery, onRefetch }: { gallery: Gallery; onRefetch: () => void }) {
  const toggle = useServerFn(toggleProofSelection);
  const submitSelection = useServerFn(submitProofSelection);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<"browse" | "narrow">("browse");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const submitted = !!gallery.proof_selection_submitted_at;
  const guided = gallery.guided_selection_enabled;
  const limit = gallery.max_proof_selections;
  const selectedImages = gallery.images.filter((i) => i.selected);
  const selectedCount = selectedImages.length;
  const overLimit = limit != null && selectedCount > limit;
  const atLimit = limit != null && selectedCount >= limit;
  const visibleImages = phase === "narrow" ? selectedImages : gallery.images;

  // If she removes her last favorite while narrowing, there's nothing left to narrow — bounce back to browsing instead of showing an empty screen.
  useEffect(() => {
    if (phase === "narrow" && selectedCount === 0) setPhase("browse");
  }, [phase, selectedCount]);

  const onToggle = async (img: Img) => {
    if (submitted) return;
    // Plain (non-guided) mode keeps the original simple rule: never let
    // her exceed the limit. Guided mode allows over-selecting here on
    // purpose — see toggleProofSelection's own comment — the limit is
    // only enforced once she tries to submit.
    if (!guided && !img.selected && atLimit) {
      toast.error(`אפשר לבחור עד ${limit} תמונות`);
      return;
    }
    try {
      await toggle({ data: { imageId: img.id, selected: !img.selected } });
      onRefetch();
    } catch (e: any) {
      toast.error(e?.message ?? "עדכון הבחירה נכשל");
    }
  };

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await submitSelection({ data: { workflowId: gallery.id } });
      toast.success(`הבחירה נשלחה — ${res.count} תמונות`);
      onRefetch();
    } catch (e: any) {
      toast.error(e?.message ?? "שליחת הבחירה נכשלה");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {guided && (
        <div className="space-y-1.5">
          <GuidedStepper phase={phase} />
          <p className="text-xs text-muted-foreground">
            {phase === "browse" ? "שלב 1: סמני לב על כל תמונה שאהבת — אין הגבלה בשלב הזה." : `שלב 2: הסירי תמונות אחת אחת עד שנשארות בדיוק ${limit ?? ""} התמונות שלך.`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {visibleImages.map((img, i) => (
          <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden border-2 transition-colors" style={{ borderColor: img.selected ? "var(--color-primary, #2d3d2b)" : "transparent" }}>
            <button type="button" onClick={() => setLightboxIndex(i)} className="absolute inset-0" aria-label="הגדלת תמונה">
              <img src={img.image_url} alt="" className="w-full h-full object-cover" />
            </button>
            <button
              type="button"
              onClick={() => onToggle(img)}
              disabled={submitted}
              className={`absolute top-2 left-2 h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
                phase === "narrow" ? "bg-destructive text-destructive-foreground" : img.selected ? "bg-primary text-primary-foreground" : "bg-white/70 text-primary"
              }`}
              aria-label={phase === "narrow" ? "הסרה מהנבחרות" : "סימון מועדפת"}
            >
              {phase === "narrow" ? <X className="h-3.5 w-3.5" /> : <Heart className={`h-3.5 w-3.5 ${img.selected ? "fill-current" : ""}`} />}
            </button>
          </div>
        ))}
      </div>

      {lightboxIndex != null && (
        <Lightbox
          images={visibleImages.map((i) => ({ id: i.id, url: i.image_url }))}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          renderActions={
            submitted
              ? undefined
              : (lbImg) => {
                  const full = gallery.images.find((i) => i.id === lbImg.id);
                  if (!full) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => onToggle(full)}
                      className={`inline-flex items-center gap-1.5 h-10 px-5 rounded-full text-sm font-semibold ${
                        phase === "narrow" ? "bg-destructive text-destructive-foreground" : full.selected ? "bg-primary text-primary-foreground" : "bg-white/15 text-white"
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

      <div className="sticky bottom-3 z-10 mt-3 bg-card/95 backdrop-blur border border-primary/15 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 shadow-sm flex-wrap">
        <div className="text-sm">
          {submitted ? (
            <span className="text-primary font-medium flex items-center gap-1.5">
              <Check className="h-4 w-4" /> הבחירה נשלחה — {selectedCount} תמונות
            </span>
          ) : overLimit ? (
            <span className="text-destructive font-medium">
              יש להסיר עוד {selectedCount - (limit ?? 0)} כדי להגיע ל-{limit}
            </span>
          ) : (
            <span className={atLimit ? "text-primary font-medium" : "text-muted-foreground"}>
              {selectedCount}
              {limit != null ? ` / ${limit}` : ""} נבחרו
            </span>
          )}
        </div>
        {!submitted && (
          <div className="flex items-center gap-2">
            {guided && phase === "narrow" && (
              <button type="button" onClick={() => setPhase("browse")} className="text-xs text-muted-foreground hover:text-primary underline">
                ← חזרה לכל התמונות
              </button>
            )}
            {guided && phase === "browse" ? (
              <button
                type="button"
                onClick={() => setPhase("narrow")}
                disabled={selectedCount === 0}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                המשך לצמצום ←
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting || selectedCount === 0 || overLimit}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizonal className="h-3.5 w-3.5" />}
                שליחת הבחירה הסופית
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function AlbumGrid({ gallery, name }: { gallery: Gallery; name: string }) {
  const [watermark, setWatermark] = useState(false);
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const onDownloadZip = async () => {
    setZipping({ done: 0, total: gallery.images.length });
    try {
      const photos = gallery.images.map((img, i) => ({
        url: img.original_image_url || img.image_url,
        name: `${String(i + 1).padStart(3, "0")}.jpg`,
      }));
      await downloadPhotosAsZip(photos, {
        watermark,
        zipName: `${name || "האלבום-שלי"}.zip`,
        onProgress: (done, total) => setZipping({ done, total }),
      });
    } catch (e: any) {
      toast.error(e?.message ?? "הורדת האלבום נכשלה");
    } finally {
      setZipping(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 bg-primary/5 border border-primary/10 rounded-2xl px-4 py-3">
        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} className="accent-primary h-4 w-4" />
          עם סימן מים
        </label>
        <button
          type="button"
          onClick={onDownloadZip}
          disabled={!!zipping}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {zipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
          {zipping ? `מכינה קובץ... ${zipping.done}/${zipping.total}` : "הורדת כל האלבום (ZIP, איכות מלאה)"}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {gallery.images.map((img, i) => (
          <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden group">
            <button type="button" onClick={() => setLightboxIndex(i)} className="absolute inset-0" aria-label="הגדלת תמונה">
              <img src={img.image_url} alt="" className="w-full h-full object-cover" />
            </button>
            <a
              href={img.original_image_url || img.image_url}
              download
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-2 left-2 h-8 w-8 rounded-full bg-white/85 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              aria-label="הורדה"
              title="הורדת התמונה הזו (איכות מלאה)"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
        ))}
      </div>

      {lightboxIndex != null && (
        <Lightbox
          // Full-quality original, not the display copy — zooming in should show the real detail.
          images={gallery.images.map((i) => ({ id: i.id, url: i.original_image_url || i.image_url }))}
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

function MyPhotosPage() {
  const fetchGalleries = useServerFn(getMyPhotoGalleries);
  const qc = useQueryClient();
  const galleries = useQuery({ queryKey: ["my-photo-galleries"], queryFn: () => fetchGalleries({}) });
  const rows = (galleries.data ?? []) as unknown as Gallery[];
  const refetch = () => qc.invalidateQueries({ queryKey: ["my-photo-galleries"] });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <section className="container-page py-14 flex-1 space-y-10">
        <div>
          <h1 className="font-display text-3xl text-primary flex items-center gap-2">
            <Camera className="h-6 w-6" /> התמונות שלי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">כל צילום שהזמנת עם מיכל — כאן יעלו התמונות שלך, ותוכלי לבחור מועדפות ולהוריד את האלבום הסופי.</p>
        </div>

        {rows.length === 0 && <p className="text-sm text-muted-foreground">עדיין אין לך הזמנת צילומים.</p>}

        {rows.map((g) => (
          <div key={g.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl text-primary" dir="ltr">
                {g.booking?.session_date ?? "הצילום שלך"}
              </h2>
              {g.stage === "proofs_ready" && !g.proof_selection_submitted_at && (
                <span className="text-xs text-primary flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> {g.images.filter((i) => i.selected).length} נבחרו
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{STAGE_MESSAGE[g.stage]}</p>
            {g.stage === "proofs_ready" && g.images.length > 0 && (
              <>
                <ProofGrid gallery={g} onRefetch={refetch} />
                {/* Per explicit request — shown under the watermarked proof
                    photos, above/below doesn't matter as much as it being
                    clearly attached to this set specifically. */}
                <p className="text-center text-sm font-medium text-primary bg-primary/5 border border-primary/15 rounded-xl py-3 px-4">
                  קבלת כל התמונות מותנת בתוספת 150 ש"ח
                </p>
              </>
            )}
            {g.stage === "album_published" && g.images.length > 0 && <AlbumGrid gallery={g} name={g.booking?.contact_name ?? ""} />}
          </div>
        ))}
      </section>
      <Footer />
    </div>
  );
}

// "טקסט מתמונות" — a word/phrase where every letter is filled with a
// mosaic of the visitor's own uploaded photos. Sibling tool to
// /collage-maker (same free, no-account, everything-stays-in-the-browser
// deal), reusing its size/format picker and page chrome for consistency;
// the actual mosaic math lives in src/lib/mosaic-text.ts, kept framework-
// free there so it has no route/React baggage.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { CARD_FORMATS, CARD_SIZES, getCardDimensions, type CardFormatId } from "@/lib/collage-data";
import { buildMosaic, prepareSquarePhoto, type PreparedPhoto } from "@/lib/mosaic-text";
import { getSiteSessionId } from "@/lib/site-tracking";
import { Sparkles, Type, Upload, X, Download, Loader2, RectangleVertical, ImageIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/collage-text")({
  component: MosaicTextMaker,
  head: () => ({
    meta: [
      { title: "טקסט מתמונות | Sweetbaby" },
      { name: "description", content: "יוצרים מילה או ברכה עשויה מתוך התמונות שלכם — כל אות מלאה בפסיפס תמונות, ומורידים כתמונה בחינם." },
      { name: "robots", content: "index, follow" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Rubik:wght@900&family=Heebo:wght@900&family=Secular+One&display=swap",
      },
    ],
  }),
});

const FONT_OPTIONS = [
  { id: "rubik", label: "רוביק (מודגש)", family: "Rubik, sans-serif", weight: "900" },
  { id: "heebo", label: "היבו (מודגש)", family: "Heebo, sans-serif", weight: "900" },
  { id: "assistant", label: "אסיסטנט (מודגש)", family: "Assistant, sans-serif", weight: "700" },
  { id: "secular-one", label: "סקולר וואן", family: "'Secular One', sans-serif", weight: "400" },
] as const;

const BG_PRESETS = [
  { id: "white", label: "לבן", color: "#ffffff" },
  { id: "cream", label: "שמנת", color: "#fdf8f0" },
  { id: "black", label: "שחור", color: "#1a1a1a" },
  { id: "transparent", label: "שקוף", color: null },
] as const;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type Step = 1 | 2 | 3;
type UploadedPhoto = { id: string; dataUrl: string };

function MosaicTextMaker() {
  const [step, setStep] = useState<Step>(1);

  // Step 1 — text + size
  const [text, setText] = useState("שנה טובה");
  // Landscape by default — a horizontal word/phrase reads better on a wide
  // canvas than a tall one.
  const [formatId, setFormatId] = useState<CardFormatId>("landscape");
  const [sizeId, setSizeId] = useState(CARD_SIZES.landscape[0].id);
  const cardDims = useMemo(() => getCardDimensions(formatId, sizeId), [formatId, sizeId]);

  const changeFormat = (id: CardFormatId) => {
    setFormatId(id);
    setSizeId(CARD_SIZES[id][0].id);
  };

  // Step 2 — photos
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3 — mosaic options + render state
  const [cols, setCols] = useState(24);
  const [fontId, setFontId] = useState<(typeof FONT_OPTIONS)[number]["id"]>("rubik");
  const [bgId, setBgId] = useState<(typeof BG_PRESETS)[number]["id"]>("white");
  const [customBg, setCustomBg] = useState("#ffffff");
  const [rendering, setRendering] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const preparedRef = useRef<Map<string, PreparedPhoto>>(new Map());

  const font = FONT_OPTIONS.find((f) => f.id === fontId) ?? FONT_OPTIONS[0];
  const bgPreset = BG_PRESETS.find((b) => b.id === bgId) ?? BG_PRESETS[0];
  const bgColor = bgId === "transparent" ? null : bgPreset.color ?? customBg;

  const onFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Snapshot into a plain array BEFORE clearing the input — FileList is a
    // live view of input.files, so resetting e.target.value first would
    // empty this same list out from under us.
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (files.length === 0) return;
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      toast.error("צריך קבצי תמונה");
      return;
    }
    try {
      const withIds = await Promise.all(
        imageFiles.map(async (f, i) => ({ id: `photo-${Date.now()}-${i}`, dataUrl: await readFileAsDataUrl(f) })),
      );
      setPhotos((prev) => [...prev, ...withIds]);
    } catch {
      toast.error("העלאת התמונות נכשלה, נסי שוב");
    }
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    preparedRef.current.delete(id);
  };

  // Renders the mosaic into the preview canvas whenever a relevant option
  // changes — debounced a little so dragging the tile-count slider doesn't
  // kick off a full re-render on every intermediate pixel.
  useEffect(() => {
    if (step !== 3 || photos.length === 0) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      setRendering(true);
      try {
        const prepared: PreparedPhoto[] = [];
        for (const p of photos) {
          let pp = preparedRef.current.get(p.id);
          if (!pp) {
            pp = await prepareSquarePhoto(p.id, p.dataUrl);
            preparedRef.current.set(p.id, pp);
          }
          prepared.push(pp);
        }
        if (cancelled) return;
        const canvas = await buildMosaic(
          {
            text,
            fontFamily: font.family,
            fontWeight: font.weight,
            width: cardDims.w,
            height: cardDims.h,
            cols,
            background: bgColor ? { kind: "color", color: bgColor } : { kind: "transparent" },
          },
          prepared,
        );
        if (cancelled) return;
        resultCanvasRef.current = canvas;
        const previewEl = previewCanvasRef.current;
        if (previewEl) {
          previewEl.width = canvas.width;
          previewEl.height = canvas.height;
          const ctx = previewEl.getContext("2d");
          ctx?.clearRect(0, 0, previewEl.width, previewEl.height);
          ctx?.drawImage(canvas, 0, 0);
        }
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "יצירת הפסיפס נכשלה, נסי שוב");
      } finally {
        if (!cancelled) setRendering(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, photos, text, font.family, font.weight, cardDims.w, cardDims.h, cols, bgColor]);

  const download = async (format: "jpeg" | "png") => {
    const canvas = resultCanvasRef.current;
    if (!canvas) {
      toast.error("מכינה עדיין את הפסיפס, שנייה...");
      return;
    }
    setDownloading(true);
    try {
      // JPEG has no alpha channel — force a white backing so "transparent"
      // background doesn't silently turn black on export.
      let exportCanvas = canvas;
      if (format === "jpeg" && bgId === "transparent") {
        exportCanvas = document.createElement("canvas");
        exportCanvas.width = canvas.width;
        exportCanvas.height = canvas.height;
        const ctx = exportCanvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(canvas, 0, 0);
      }
      const mime = format === "jpeg" ? "image/jpeg" : "image/png";
      const dataUrl = exportCanvas.toDataURL(mime, 0.92);
      await new Promise<void>((resolve) => {
        exportCanvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve();
              return;
            }
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `sweetbaby-mosaic.${format === "jpeg" ? "jpg" : "png"}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(link.href), 5000);
            resolve();
          },
          mime,
          0.92,
        );
      });
      // Best-effort, fire-and-forget log for the admin gallery — same
      // pattern (and same collage_creations table/bucket) as the other
      // collage tools; styleId doubles as a type tag since this table has
      // no dedicated column for it.
      const sessionId = getSiteSessionId();
      if (sessionId) {
        import("@/lib/analytics.functions").then(({ saveCollageCreation }) =>
          saveCollageCreation({
            data: {
              sessionId,
              imageDataUrl: dataUrl,
              formatId,
              sizeId,
              styleId: "mosaic-text",
              photoCount: photos.length,
              caption: text,
            },
          }).catch(() => {}),
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? "ההורדה נכשלה, נסי שוב");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <section className="container-page py-12 flex-1">
        <div className="flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">
          <Sparkles className="h-3.5 w-3.5" /> חינם לכולם
        </div>
        <h1 className="font-display text-4xl md:text-5xl text-primary mb-2">טקסט מתמונות</h1>
        <p className="text-muted-foreground max-w-2xl mb-8">
          מילה או ברכה קצרה, שכל אות בה בנויה מפסיפס של התמונות שלכם — ואז מורידים כתמונה, בלי הרשמה ובלי לשמור כלום אצלנו.
        </p>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8 text-sm">
          {[
            { n: 1 as Step, label: "טקסט וגודל" },
            { n: 2 as Step, label: "העלאת תמונות" },
            { n: 3 as Step, label: "עריכה ותצוגה" },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => (s.n < step || (s.n === 2 && text.trim()) || (s.n === 3 && photos.length > 0) ? setStep(s.n) : undefined)}
                className={`h-8 px-3 rounded-full text-xs font-semibold border transition-colors ${
                  step === s.n ? "bg-primary text-primary-foreground border-primary" : "border-primary/20 text-primary"
                }`}
              >
                {s.n}. {s.label}
              </button>
              {i < 2 && <div className="w-6 h-px bg-primary/20" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="max-w-xl space-y-6">
            <div className="glass-card rounded-3xl p-5 space-y-3">
              <h2 className="font-display text-xl text-primary flex items-center gap-2">
                <Type className="h-4 w-4" /> הטקסט
              </h2>
              <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={20} dir="rtl" className="text-lg text-center" />
              <p className="text-xs text-muted-foreground">מומלץ עד כ-15 תווים — מילה או ביטוי קצר קריא הרבה יותר טוב כפסיפס.</p>
            </div>

            <div className="glass-card rounded-3xl p-5 space-y-4">
              <h2 className="font-display text-xl text-primary flex items-center gap-2">
                <RectangleVertical className="h-4 w-4" /> פורמט וגודל
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {CARD_FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => changeFormat(f.id)}
                    className={`rounded-xl px-2 py-3 text-xs font-medium border-2 transition-colors ${
                      formatId === f.id ? "border-primary bg-primary text-primary-foreground" : "border-primary/15 hover:border-primary bg-card text-primary"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {CARD_SIZES[formatId].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSizeId(s.id)}
                    className={`rounded-full px-4 py-2 text-xs font-medium border transition-colors ${
                      sizeId === s.id ? "bg-primary text-primary-foreground border-primary" : "border-primary/20 hover:border-primary"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={() => setStep(2)} disabled={!text.trim()} className="h-12 rounded-full px-8">
              המשך להעלאת תמונות
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="max-w-xl space-y-6">
            <div className="glass-card rounded-3xl p-5 space-y-3">
              <h2 className="font-display text-xl text-primary flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> העלאת תמונות
              </h2>
              <p className="text-sm text-muted-foreground">
                אפשר להעלות כמה שרוצים — לתוצאה יפה ומגוונת מומלץ לפחות 20-30 תמונות. כרגע הועלו {photos.length}.
              </p>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onFilesSelected} />
              <Button variant="outline" className="w-full rounded-full gap-2" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> בחירת תמונות
              </Button>
              {photos.length > 0 && (
                <div className="grid grid-cols-5 gap-2 pt-2">
                  {photos.map((p) => (
                    <div key={p.id} className="relative group">
                      <img src={p.dataUrl} alt="" className="aspect-square object-cover rounded-lg border border-primary/10" />
                      <button
                        type="button"
                        onClick={() => removePhoto(p.id)}
                        className="absolute -top-1.5 -left-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="הסרה"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="h-12 rounded-full px-6">
                חזרה
              </Button>
              <Button onClick={() => setStep(3)} disabled={photos.length === 0} className="h-12 rounded-full px-8">
                המשך לעריכה
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid lg:grid-cols-[1fr_1.1fr] gap-8 items-start">
            <div className="space-y-6 order-2 lg:order-1">
              <div className="glass-card rounded-3xl p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">צפיפות הפסיפס — {cols} עמודות</label>
                  <Slider min={12} max={40} step={1} value={[cols]} onValueChange={([v]) => setCols(v)} className="mt-2" />
                  <p className="text-[11px] text-muted-foreground mt-1">פחות עמודות = כל תמונה נראית יותר ברורה. יותר עמודות = פסיפס עדין יותר, עם יותר חזרות על אותה תמונה.</p>
                </div>

                <div>
                  <div className="text-xs font-semibold text-primary mb-2">פונט</div>
                  <div className="grid grid-cols-2 gap-2">
                    {FONT_OPTIONS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFontId(f.id)}
                        style={{ fontFamily: f.family, fontWeight: f.weight }}
                        className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                          fontId === f.id ? "bg-primary text-primary-foreground border-primary" : "border-primary/20 hover:border-primary text-primary"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-primary mb-2">רקע</div>
                  <div className="flex flex-wrap gap-2">
                    {BG_PRESETS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBgId(b.id)}
                        className={`rounded-full px-4 py-2 text-xs font-medium border transition-colors ${
                          bgId === b.id ? "bg-primary text-primary-foreground border-primary" : "border-primary/20 hover:border-primary"
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  {bgId !== "transparent" && bgId !== "white" && bgId !== "cream" && bgId !== "black" && (
                    <input type="color" value={customBg} onChange={(e) => setCustomBg(e.target.value)} className="w-full h-9 rounded-lg border border-black/10 mt-2" />
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)} className="h-12 rounded-full px-6">
                  חזרה
                </Button>
              </div>
            </div>

            <div className="order-1 lg:order-2 lg:sticky lg:top-24">
              <div className="max-w-md mx-auto">
                <div className="relative rounded-2xl overflow-hidden border border-primary/10 bg-[repeating-conic-gradient(#eee_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">
                  <canvas ref={previewCanvasRef} className="w-full h-auto block" />
                  {rendering && (
                    <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button onClick={() => download("jpeg")} disabled={downloading || rendering} className="flex-1 h-12 rounded-full gap-2">
                    <Download className="h-4 w-4" /> {downloading ? "מכינה קובץ…" : "הורדה כ-JPEG"}
                  </Button>
                  <Button onClick={() => download("png")} disabled={downloading || rendering} variant="outline" className="h-12 rounded-full px-5">
                    PNG
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground text-center mt-2">נשמר רק אצלך במחשב/בטלפון — לא נשלח ולא נשמר אצלנו.</p>
              </div>
            </div>
          </div>
        )}
      </section>
      <Footer />
    </div>
  );
}

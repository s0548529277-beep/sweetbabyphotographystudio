// Free, public collage/greeting-card maker — no account needed, nothing
// ever leaves the browser (photos are read locally as data: URLs and the
// finished card is rasterized + downloaded client-side; see
// downloadCollagePng below). Intentionally scoped to fixed (not freely
// draggable/resizable) layouts per photo count — a real, useful v1, not a
// full drag/resize/sticker design tool.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollageCard, CARD_W, CARD_H } from "@/components/CollageCard";
import { COLLAGE_STYLES, COLLAGE_OCCASIONS, CAPTION_GROUPS, findCollageStyle, type CollageStyleId, type CollageOccasionId } from "@/lib/collage-data";
import { Download, Sparkles, Image as ImageIcon, Type } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/collage-maker")({
  component: CollageMaker,
  head: () => ({
    meta: [
      { title: "עיצוב קולאז׳ חינם | Sweetbaby" },
      { name: "description", content: "עיצוב קולאז' תמונות וכיתובים בחינם — עד 7 תמונות, כיתובים מוכנים או משלכם, ועיצובים מוכנים לכל אירוע." },
      { name: "robots", content: "index, follow" },
    ],
  }),
});

const PHOTO_COUNTS = [1, 2, 3, 4, 5, 6, 7] as const;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Serializes the live SVG (exactly what's on screen) and rasterizes it to a downloadable PNG — see this file's top doc comment for why the SVG itself is the single source of truth for both preview and export. */
async function downloadCollagePng(svgEl: SVGSVGElement) {
  // Make sure the custom font (loaded site-wide in __root.tsx) is actually
  // ready before rasterizing, or the exported PNG can silently fall back to
  // a system serif for one render.
  try {
    await document.fonts.ready;
  } catch {
    // best effort — proceed anyway
  }
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(CARD_W));
  clone.setAttribute("height", String(CARD_H));
  const svgString = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = 2; // 2000x2500 — good enough for sharing/printing from a free web tool
      const canvas = document.createElement("canvas");
      canvas.width = CARD_W * scale;
      canvas.height = CARD_H * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas לא נתמך בדפדפן הזה"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("יצירת הקובץ נכשלה"));
          return;
        }
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "sweetbaby-collage.png";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 5000);
        resolve();
      }, "image/png");
    };
    img.onerror = () => reject(new Error("טעינת התצוגה נכשלה"));
    img.src = svgUrl;
  });
}

function CollageMaker() {
  const [styleId, setStyleId] = useState<CollageStyleId>("floral");
  const [photoCount, setPhotoCount] = useState(3);
  const [photos, setPhotos] = useState<(string | null)[]>(Array(3).fill(null));
  const [caption, setCaption] = useState("שנה טובה");
  const [subtitle, setSubtitle] = useState("");
  const [downloading, setDownloading] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSlotRef = useRef<number | null>(null);

  const style = useMemo(() => findCollageStyle(styleId), [styleId]);

  const changeCount = (n: number) => {
    setPhotoCount(n);
    setPhotos((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push(null);
      return next;
    });
  };

  const applyOccasion = (id: CollageOccasionId) => {
    const o = COLLAGE_OCCASIONS.find((x) => x.id === id);
    if (!o) return;
    setStyleId(o.style);
    setCaption(o.caption);
    setSubtitle(o.subtitle ?? "");
    changeCount(o.photoCount);
  };

  const openFilePicker = (slotIndex: number) => {
    pendingSlotRef.current = slotIndex;
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    const slot = pendingSlotRef.current;
    if (!file || slot === null) return;
    if (!file.type.startsWith("image/")) {
      toast.error("צריך קובץ תמונה");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPhotos((prev) => {
        const next = [...prev];
        next[slot] = dataUrl;
        return next;
      });
    } catch {
      toast.error("טעינת התמונה נכשלה, נסי שוב");
    }
  };

  const download = async () => {
    if (!svgRef.current) return;
    setDownloading(true);
    try {
      await downloadCollagePng(svgRef.current);
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
        <h1 className="font-display text-4xl md:text-5xl text-primary mb-2">עיצוב קולאז׳ וברכה</h1>
        <p className="text-muted-foreground max-w-2xl mb-8">
          עד 7 תמונות, כיתוב מוכן או משלך, ועיצוב שמתאים לרגע — ואז מורידים כתמונה, בלי הרשמה ובלי לשמור כלום אצלנו.
        </p>

        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-8 items-start">
          {/* Controls */}
          <div className="space-y-6 order-2 lg:order-1">
            <div className="glass-card rounded-3xl p-5">
              <h2 className="font-display text-xl text-primary mb-3">עיצובים מוכנים</h2>
              <div className="grid grid-cols-3 gap-2">
                {COLLAGE_OCCASIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => applyOccasion(o.id)}
                    className="rounded-xl border border-primary/15 hover:border-primary bg-card px-2 py-3 text-xs font-medium text-primary transition-colors"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-3xl p-5">
              <h2 className="font-display text-xl text-primary mb-3">סגנון עיצוב</h2>
              <div className="grid grid-cols-3 gap-2">
                {COLLAGE_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyleId(s.id)}
                    className={`rounded-xl border-2 px-2 py-3 text-xs font-medium transition-colors ${
                      styleId === s.id ? "border-primary" : "border-transparent"
                    }`}
                    style={{ background: s.bg, color: s.captionColor }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-3xl p-5">
              <h2 className="font-display text-xl text-primary mb-3 flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> כמות תמונות
              </h2>
              <div className="flex flex-wrap gap-2">
                {PHOTO_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => changeCount(n)}
                    className={`h-10 w-10 rounded-full text-sm font-medium border transition-colors ${
                      photoCount === n ? "bg-primary text-primary-foreground border-primary" : "border-primary/20 hover:border-primary"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">לחצי על כל משבצת תמונה בתצוגה כדי להעלות תמונה אליה.</p>
            </div>

            <div className="glass-card rounded-3xl p-5 space-y-4">
              <h2 className="font-display text-xl text-primary flex items-center gap-2">
                <Type className="h-4 w-4" /> כיתוב
              </h2>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">כותרת</label>
                <Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={40} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">שורה קטנה מתחת (אופציונלי)</label>
                <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={60} className="mt-1" />
              </div>
              <div className="space-y-2">
                {CAPTION_GROUPS.map((g) => (
                  <div key={g.group}>
                    <div className="text-[11px] tracking-[0.2em] uppercase text-forest/70 mb-1">{g.group}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.items.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCaption(c)}
                          className="text-xs rounded-full border border-primary/15 hover:border-primary px-3 py-1.5 text-primary transition-colors"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="order-1 lg:order-2 lg:sticky lg:top-24">
            <div className="max-w-md mx-auto">
              <CollageCard svgRef={svgRef} styleId={styleId} photos={photos} onSlotClick={openFilePicker} caption={caption} subtitle={subtitle} />
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
              <Button onClick={download} disabled={downloading} className="w-full h-12 rounded-full gap-2 mt-4">
                <Download className="h-4 w-4" /> {downloading ? "מכינה קובץ…" : "הורדת הקולאז' כתמונה"}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                נשמר רק אצלך במחשב/בטלפון — לא נשלח ולא נשמר אצלנו.
              </p>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}

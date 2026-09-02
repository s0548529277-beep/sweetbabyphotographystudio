// Free, public collage/greeting-card maker — no account needed, nothing
// ever leaves the browser (photos are read locally as data: URLs and the
// finished card is rasterized + downloaded client-side; see
// downloadCollagePng below). Intentionally scoped to fixed (not freely
// draggable/resizable) layouts per photo count — a real, useful v1, not a
// full drag/resize/sticker design tool.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollageCard } from "@/components/CollageCard";
import {
  COLLAGE_STYLES,
  COLLAGE_OCCASIONS,
  CAPTION_GROUPS,
  CAPTION_TRANSLATIONS,
  PHOTO_SHAPES,
  PHOTO_EFFECTS,
  COLOR_PALETTES,
  DECOR_THEMES,
  CARD_FORMATS,
  CARD_SIZES,
  getCardDimensions,
  getLayoutVariants,
  findCollageStyle,
  type CollageStyleId,
  type CollageOccasionId,
  type PhotoShapeId,
  type PhotoEffectId,
  type DecorThemeId,
  type CardFormatId,
} from "@/lib/collage-data";
import { rgbToHex, paletteFromAccent } from "@/lib/collage-color";
import { Download, Sparkles, Image as ImageIcon, Type, LayoutGrid, Wand2, Square, Palette, Pipette, PartyPopper, RectangleVertical, Languages, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/collage-maker")({
  component: CollageMaker,
  head: () => ({
    meta: [
      { title: "עיצוב קולאז׳ חינם | Sweetbaby" },
      { name: "description", content: "עיצוב קולאז' תמונות וכיתובים בחינם — עד 10 תמונות, כיתובים מוכנים או משלכם, ועיצובים מוכנים לכל אירוע." },
      { name: "robots", content: "index, follow" },
    ],
  }),
});

const PHOTO_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Reads an already-loaded (data: URL) photo's dominant color via an
 * offscreen canvas — coarse histogram over a downscaled 40x40 sample,
 * skipping near-white/near-black/near-gray pixels so the result is an
 * actual dominant *color*, not just "average toward grey". Falls back to
 * a plain average if every sampled pixel was near-neutral.
 */
function getDominantColor(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 40;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas לא נתמך בדפדפן הזה"));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      let data: Uint8ClampedArray;
      try {
        data = ctx.getImageData(0, 0, size, size).data;
      } catch (e) {
        reject(e);
        return;
      }
      const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a < 200) continue;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max > 240 && min > 220) continue; // near white
        if (max < 25) continue; // near black
        if (max - min < 12) continue; // near gray/desaturated
        const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
        const cur = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
        cur.count++;
        cur.r += r;
        cur.g += g;
        cur.b += b;
        buckets.set(key, cur);
      }
      let best: { count: number; r: number; g: number; b: number } | null = null;
      for (const b of buckets.values()) if (!best || b.count > best.count) best = b;
      if (!best) {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n++;
        }
        resolve(rgbToHex(r / n, g / n, b / n));
        return;
      }
      resolve(rgbToHex(best.r / best.count, best.g / best.count, best.b / best.count));
    };
    img.onerror = () => reject(new Error("טעינת התמונה נכשלה"));
    img.src = dataUrl;
  });
}

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
  // Real pixel size comes straight off the live SVG's own viewBox — it
  // varies per format/size choice (portrait/landscape/panoramic × print
  // ratio), so there's no fixed constant to fall back on here.
  const vb = svgEl.viewBox.baseVal;
  const cardW = vb && vb.width ? vb.width : svgEl.clientWidth || 1000;
  const cardH = vb && vb.height ? vb.height : svgEl.clientHeight || 1250;

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(cardW));
  clone.setAttribute("height", String(cardH));
  const svgString = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = 2; // 2x the card's own pixel size — good enough for sharing/printing from a free web tool
      const canvas = document.createElement("canvas");
      canvas.width = cardW * scale;
      canvas.height = cardH * scale;
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
  const [formatId, setFormatId] = useState<CardFormatId>("portrait");
  const [sizeId, setSizeId] = useState("13x18");
  const [styleId, setStyleId] = useState<CollageStyleId>("floral");
  const [photoCount, setPhotoCount] = useState(3);
  const [photos, setPhotos] = useState<(string | null)[]>(Array(3).fill(null));
  const [layoutId, setLayoutId] = useState("featured");
  const [shape, setShape] = useState<PhotoShapeId>("rect");
  const [effect, setEffect] = useState<PhotoEffectId>("none");
  const [frame, setFrame] = useState(false);
  const [borderStyle, setBorderStyle] = useState<"none" | "polaroid">("none");
  const [captionPlacement, setCaptionPlacement] = useState<"below" | "overlay">("below");
  const [customPalette, setCustomPalette] = useState<{ bg: string; accent: string; captionColor: string } | null>(null);
  const [decorId, setDecorId] = useState<DecorThemeId>("none");
  const [matchingColor, setMatchingColor] = useState(false);
  const [caption, setCaption] = useState("שנה טובה");
  const [subtitle, setSubtitle] = useState("");
  const [downloading, setDownloading] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSlotRef = useRef<number | null>(null);

  const style = useMemo(() => findCollageStyle(styleId), [styleId]);
  const layoutVariants = useMemo(() => getLayoutVariants(photoCount), [photoCount]);
  const cardDims = useMemo(() => getCardDimensions(formatId, sizeId), [formatId, sizeId]);

  const changeFormat = (id: CardFormatId) => {
    setFormatId(id);
    // Each format offers its own size list — jump to that format's first
    // (and, per the requested order, default) size rather than keeping an
    // id that belongs to the format just left.
    setSizeId(CARD_SIZES[id][0].id);
  };

  const changeCount = (n: number) => {
    setPhotoCount(n);
    setPhotos((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push(null);
      return next;
    });
    // Not every count offers every layout (e.g. "strip" only exists up to
    // 5) — fall back to "featured" (always available) rather than silently
    // rendering nothing if the previously-selected variant doesn't exist
    // for the new count.
    const stillValid = getLayoutVariants(n).some((v) => v.id === layoutId);
    if (!stillValid) setLayoutId("featured");
  };

  const applyOccasion = (id: CollageOccasionId) => {
    const o = COLLAGE_OCCASIONS.find((x) => x.id === id);
    if (!o) return;
    setStyleId(o.style);
    setCaption(o.caption);
    setSubtitle(o.subtitle ?? "");
    setCustomPalette(null);
    // Suggest matching themed decor for the occasions that have one —
    // still just a starting point, the "אלמנטים דקורטיביים" toggle below
    // can turn it off or switch it any time.
    setDecorId(id === "birthday1" || id === "newborn" || id === "chalaka" ? id : "none");
    changeCount(o.photoCount);
  };

  // Translates the current caption/subtitle to English when they match one
  // of the ready-made phrases (see CAPTION_TRANSLATIONS) — free-typed text
  // has no dictionary entry, so it's left alone with an explanation rather
  // than silently doing nothing.
  const translateCaptionToEnglish = () => {
    const enCaption = CAPTION_TRANSLATIONS[caption];
    const enSubtitle = subtitle ? CAPTION_TRANSLATIONS[subtitle] : undefined;
    if (!enCaption && !enSubtitle) {
      toast.error("התרגום זמין רק לכיתובים המוכנים ברשימה למטה, לא לטקסט חופשי");
      return;
    }
    if (enCaption) setCaption(enCaption);
    if (subtitle && enSubtitle) setSubtitle(enSubtitle);
  };

  const useEyedropper = async () => {
    const EyeDropperCtor = (window as any).EyeDropper;
    if (!EyeDropperCtor) {
      toast.error("טפטפת הצבע נתמכת כרגע רק בדפדפני כרום / אדג'");
      return;
    }
    try {
      const result = await new EyeDropperCtor().open();
      if (result?.sRGBHex) setCustomPalette(paletteFromAccent(result.sRGBHex));
    } catch {
      // user cancelled the eyedropper — nothing to do
    }
  };

  const autoMatchColor = async () => {
    const first = photos.find((p): p is string => Boolean(p));
    if (!first) {
      toast.error("צריך להעלות תמונה קודם כדי להתאים לפיה צבעים");
      return;
    }
    setMatchingColor(true);
    try {
      const dominant = await getDominantColor(first);
      setCustomPalette(paletteFromAccent(dominant));
    } catch {
      toast.error("ניתוח הצבע נכשל, נסי שוב");
    } finally {
      setMatchingColor(false);
    }
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
        <p className="text-muted-foreground max-w-2xl mb-6">
          עד 10 תמונות, כיתוב מוכן או משלך, ועיצוב שמתאים לרגע — ואז מורידים כתמונה, בלי הרשמה ובלי לשמור כלום אצלנו.
        </p>

        <Link
          to="/collage-studio"
          className="group flex items-center justify-between gap-4 rounded-2xl bg-[#2d3d2b] text-[#f8ede4] px-5 py-4 mb-8 hover:bg-[#2d3d2b]/90 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <Wand2 className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold">רוצה עוד יותר שליטה? נסי את סטודיו קולאז'ים</div>
              <div className="text-xs text-[#f8ede4]/70">עורך מקצועי עם תבניות, שכבות, גרירה חופשית וגופנים — כמו Canva קטן, בעברית</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 bg-[#f5d5cf] text-[#2d3d2b] px-4 py-2 rounded-full text-xs font-semibold shrink-0 group-hover:bg-[#f8ede4] transition-colors">
            כניסה לסטודיו <ArrowLeft className="h-3.5 w-3.5" />
          </span>
        </Link>

        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-8 items-start">
          {/* Controls */}
          <div className="space-y-6 order-2 lg:order-1">
            <div className="glass-card rounded-3xl p-5 space-y-4">
              <div>
                <h2 className="font-display text-xl text-primary mb-3 flex items-center gap-2">
                  <RectangleVertical className="h-4 w-4" /> פורמט
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
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary mb-2">גודל</h3>
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
            </div>

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
              <div>
                <h2 className="font-display text-xl text-primary mb-3 flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4" /> פריסה
                </h2>
                <div className="flex flex-wrap gap-2">
                  {layoutVariants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setLayoutId(v.id)}
                      className={`rounded-full px-4 py-2 text-xs font-medium border transition-colors ${
                        layoutId === v.id ? "bg-primary text-primary-foreground border-primary" : "border-primary/20 hover:border-primary"
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                  <Square className="h-4 w-4" /> צורת תמונה
                </h3>
                <div className="flex flex-wrap gap-2">
                  {PHOTO_SHAPES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setShape(s.id)}
                      className={`rounded-full px-4 py-2 text-xs font-medium border transition-colors ${
                        shape === s.id ? "bg-primary text-primary-foreground border-primary" : "border-primary/20 hover:border-primary"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                  <Wand2 className="h-4 w-4" /> אפקט
                </h3>
                <div className="flex flex-wrap gap-2">
                  {PHOTO_EFFECTS.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setEffect(e.id)}
                      className={`rounded-full px-4 py-2 text-xs font-medium border transition-colors ${
                        effect === e.id ? "bg-primary text-primary-foreground border-primary" : "border-primary/20 hover:border-primary"
                      }`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-primary cursor-pointer pt-1">
                <input type="checkbox" checked={frame} onChange={(e) => setFrame(e.target.checked)} className="h-4 w-4 accent-primary" />
                מסגרת סביב כל תמונה
              </label>

              <label className="flex items-center gap-2 text-sm text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={borderStyle === "polaroid"}
                  onChange={(e) => setBorderStyle(e.target.checked ? "polaroid" : "none")}
                  className="h-4 w-4 accent-primary"
                />
                מסגרת פולארויד לבנה (כמו ערימת תמונות מודפסות)
              </label>

              <label className="flex items-center gap-2 text-sm text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={captionPlacement === "overlay"}
                  onChange={(e) => setCaptionPlacement(e.target.checked ? "overlay" : "below")}
                  className="h-4 w-4 accent-primary"
                />
                כיתוב על גבי התמונה (במקום מתחת)
              </label>
            </div>

            <div className="glass-card rounded-3xl p-5 space-y-4">
              <div>
                <h2 className="font-display text-xl text-primary mb-3 flex items-center gap-2">
                  <Palette className="h-4 w-4" /> שילוב צבעים
                </h2>
                <div className="grid grid-cols-4 gap-2">
                  {COLOR_PALETTES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setCustomPalette({ bg: p.bg, accent: p.accent, captionColor: p.captionColor })}
                      title={p.label}
                      className={`h-10 rounded-xl border-2 flex overflow-hidden transition-colors ${
                        customPalette?.accent === p.accent && customPalette?.bg === p.bg ? "border-primary" : "border-transparent"
                      }`}
                    >
                      <span className="w-1/2 h-full" style={{ background: p.bg }} />
                      <span className="w-1/2 h-full" style={{ background: p.accent }} />
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    onClick={useEyedropper}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 hover:border-primary px-3 py-1.5 text-xs font-medium text-primary transition-colors"
                  >
                    <Pipette className="h-3.5 w-3.5" /> טפטפת צבע
                  </button>
                  <button
                    type="button"
                    onClick={autoMatchColor}
                    disabled={matchingColor}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 hover:border-primary px-3 py-1.5 text-xs font-medium text-primary transition-colors disabled:opacity-50"
                  >
                    <Wand2 className="h-3.5 w-3.5" /> {matchingColor ? "מתאימה…" : "התאמה אוטומטית לפי התמונה"}
                  </button>
                  {customPalette && (
                    <button
                      type="button"
                      onClick={() => setCustomPalette(null)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 hover:border-primary px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors"
                    >
                      איפוס לצבעי הסגנון
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                  <PartyPopper className="h-4 w-4" /> אלמנטים דקורטיביים
                </h3>
                <div className="flex flex-wrap gap-2">
                  {DECOR_THEMES.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDecorId(d.id)}
                      className={`rounded-full px-4 py-2 text-xs font-medium border transition-colors ${
                        decorId === d.id ? "bg-primary text-primary-foreground border-primary" : "border-primary/20 hover:border-primary"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
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
              <button
                type="button"
                onClick={translateCaptionToEnglish}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 hover:border-primary px-3 py-1.5 text-xs font-medium text-primary transition-colors"
              >
                <Languages className="h-3.5 w-3.5" /> אותו כיתוב באנגלית
              </button>
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
              <CollageCard
                svgRef={svgRef}
                cardW={cardDims.w}
                cardH={cardDims.h}
                styleId={styleId}
                photos={photos}
                layoutId={layoutId}
                shape={shape}
                effect={effect}
                frame={frame}
                borderStyle={borderStyle}
                captionPlacement={captionPlacement}
                paletteOverride={customPalette}
                decorId={decorId}
                onSlotClick={openFilePicker}
                caption={caption}
                subtitle={subtitle}
              />
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

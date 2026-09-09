import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  ImagePlus,
  Images,
  LayoutGrid,
  Loader2,
  LockKeyhole,
  Palette,
  Sparkles,
  Trash2,
  Type,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { CollageCard } from "@/components/CollageCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CARD_FORMATS,
  CARD_SIZES,
  COLLAGE_STYLES,
  COLOR_PALETTES,
  DECOR_THEMES,
  PHOTO_EFFECTS,
  PHOTO_SHAPES,
  getCardDimensions,
  getLayoutVariants,
  type CardFormatId,
  type CollageStyleId,
  type DecorThemeId,
  type PhotoEffectId,
  type PhotoShapeId,
} from "@/lib/collage-data";
import { COLLAGE_IDEAS, COLLAGE_IDEA_CATEGORIES, type CollageIdeaCategory } from "@/lib/collage-ideas";
import {
  BACKGROUND_PATTERNS,
  BACKGROUND_SWATCHES,
  CAPTION_STICKERS,
  STICKERS,
  type BackgroundPatternId,
  type PlacedSticker,
  type StickerKind,
} from "@/lib/collage-decor";
import { getSiteSessionId } from "@/lib/site-tracking";


type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { id: 1, label: "גודל" },
  { id: 2, label: "רעיון" },
  { id: 3, label: "תמונות" },
  { id: 4, label: "עיצוב" },
] as const;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function downloadCollage(svgEl: SVGSVGElement, type: "png" | "jpeg"): Promise<string> {
  await document.fonts.ready.catch(() => undefined);
  const viewBox = svgEl.viewBox.baseVal;
  const width = viewBox.width || 1000;
  const height = viewBox.height || 1250;
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = reject;
      next.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("הדפדפן לא הצליח להכין את הקובץ");
    if (type === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const mime = type === "jpeg" ? "image/jpeg" : "image/png";
    const dataUrl = canvas.toDataURL(mime, 0.94);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.94));
    if (!blob) throw new Error("יצירת הקובץ נכשלה");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `sweetbaby-collage.${type === "jpeg" ? "jpg" : "png"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function SizeIcon({ format }: { format: CardFormatId }) {
  const size = format === "portrait" ? "h-24 w-16" : format === "landscape" ? "h-16 w-24" : format === "square" ? "h-20 w-20" : "h-12 w-28";
  return <span className={`${size} block rounded-md border-2 border-secondary bg-card shadow-sm`}><span className="m-1 block h-[calc(100%-0.5rem)] rounded-sm border border-dashed border-secondary" /></span>;
}

function IdeaPreview({ motif }: { motif: string }) {
  if (motif === "scatter") return <div className="relative h-28"><i className="absolute right-6 top-2 h-20 w-16 -rotate-6 border-4 border-card bg-secondary shadow-sm" /><i className="absolute left-7 top-5 h-20 w-16 rotate-6 border-4 border-card bg-accent/40 shadow-sm" /><i className="absolute left-1/2 top-3 h-20 w-16 -translate-x-1/2 bg-muted shadow-sm" /></div>;
  if (motif === "strip") return <div className="grid h-28 grid-cols-4 gap-1 bg-primary p-2">{[0, 1, 2, 3].map((n) => <i key={n} className={n % 2 ? "bg-secondary" : "bg-accent/50"} />)}</div>;
  if (motif === "circle") return <div className="grid h-28 grid-cols-3 gap-2 p-2">{[0, 1, 2, 3, 4, 5].map((n) => <i key={n} className="rounded-full bg-secondary" />)}</div>;
  if (motif === "hero") return <div className="grid h-28 grid-cols-3 grid-rows-2 gap-1"><i className="col-span-2 row-span-2 bg-secondary" /><i className="bg-accent/50" /><i className="bg-muted" /></div>;
  if (motif === "story") return <div className="flex h-28 flex-col gap-2 p-2"><i className="min-h-0 flex-1 bg-secondary" /><i className="mx-auto h-2 w-2/3 bg-primary/35" /><i className="mx-auto h-1 w-1/2 bg-primary/20" /></div>;
  return <div className="grid h-28 grid-cols-3 gap-1">{[0, 1, 2, 3, 4, 5].map((n) => <i key={n} className={n % 3 ? "bg-secondary" : "bg-accent/50"} />)}</div>;
}

export function CollageWizard() {
  const [step, setStep] = useState<Step>(1);
  const [formatId, setFormatId] = useState<CardFormatId>("portrait");
  const [sizeId, setSizeId] = useState("13x18");
  const [category, setCategory] = useState<CollageIdeaCategory>("popular");
  const [ideaId, setIdeaId] = useState("hero-story");
  const [photoCount, setPhotoCount] = useState(5);
  const [photos, setPhotos] = useState<(string | null)[]>(Array(5).fill(null));
  const [layoutId, setLayoutId] = useState("featured");
  const [styleId, setStyleId] = useState<CollageStyleId>("floral");
  const [shape, setShape] = useState<PhotoShapeId>("rounded");
  const [effect, setEffect] = useState<PhotoEffectId>("none");
  const [borderStyle, setBorderStyle] = useState<"none" | "polaroid">("none");
  const [frame, setFrame] = useState(false);
  const [captionPlacement, setCaptionPlacement] = useState<"below" | "overlay">("below");
  const [decorId, setDecorId] = useState<DecorThemeId>("none");
  const [caption, setCaption] = useState("הרגעים שלנו");
  const [subtitle, setSubtitle] = useState("רגעים שנשארים לתמיד");
  const [palette, setPalette] = useState<{ bg: string; accent: string; captionColor: string } | null>(null);
  const [bgPattern, setBgPattern] = useState<BackgroundPatternId>("none");
  const [stickers, setStickers] = useState<PlacedSticker[]>([]);
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSlotRef = useRef<number | null>(null);

  const dimensions = useMemo(() => getCardDimensions(formatId, sizeId), [formatId, sizeId]);
  const layouts = useMemo(() => getLayoutVariants(photoCount), [photoCount]);
  const ideas = useMemo(() => {
    const term = search.trim();
    return COLLAGE_IDEAS.filter((item) => (term ? `${item.name} ${item.description} ${item.caption}`.includes(term) : item.category === category));
  }, [category, search]);
  const uploadedCount = photos.filter(Boolean).length;

  const addSticker = (sticker: Pick<PlacedSticker, "kind" | "text" | "tone">) => {
    setStickers((current) => [
      ...current,
      {
        uid: `${Date.now()}-${current.length}`,
        ...sticker,
        // Placed along a soft spiral so consecutive stickers never land on
        // top of each other; the user removes one by clicking it.
        x: 0.5 + Math.cos(current.length * 1.9) * (0.16 + current.length * 0.015),
        y: 0.5 + Math.sin(current.length * 1.9) * (0.2 + current.length * 0.012),
        scale: sticker.text ? 1 : 0.9,
      },
    ]);
  };


  const changeFormat = (format: CardFormatId) => {
    setFormatId(format);
    setSizeId(CARD_SIZES[format][0].id);
  };

  const changePhotoCount = (count: number) => {
    setPhotoCount(count);
    setPhotos((current) => {
      const next = current.slice(0, count);
      while (next.length < count) next.push(null);
      return next;
    });
    const available = getLayoutVariants(count);
    if (!available.some((item) => item.id === layoutId)) setLayoutId(available[0]?.id ?? "featured");
  };

  const selectIdea = (id: string) => {
    const selected = COLLAGE_IDEAS.find((item) => item.id === id);
    if (!selected) return;
    setIdeaId(id);
    changePhotoCount(selected.photoCount);
    setLayoutId(selected.layoutId);
    setStyleId(selected.styleId);
    setShape(selected.shape);
    setEffect(selected.effect);
    setBorderStyle(selected.borderStyle);
    setDecorId(selected.decorId);
    setCaption(selected.caption);
    setSubtitle(selected.subtitle);
    setPalette(null);
  };

  const onFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;
    try {
      const urls = await Promise.all(imageFiles.map(readFileAsDataUrl));
      setPhotos((current) => {
        const next = [...current];
        const pending = pendingSlotRef.current;
        if (pending !== null && urls[0]) {
          next[pending] = urls[0];
          urls.slice(1).forEach((url) => {
            const empty = next.findIndex((item) => !item);
            if (empty >= 0) next[empty] = url;
          });
        } else {
          urls.forEach((url) => {
            const empty = next.findIndex((item) => !item);
            if (empty >= 0) next[empty] = url;
          });
        }
        return next;
      });
    } catch {
      toast.error("טעינת התמונות נכשלה, נסי שוב");
    } finally {
      pendingSlotRef.current = null;
    }
  };

  const openPicker = (slot: number | null = null) => {
    pendingSlotRef.current = slot;
    fileInputRef.current?.click();
  };

  const download = async (type: "png" | "jpeg") => {
    if (!svgRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await downloadCollage(svgRef.current, type);
      const sessionId = getSiteSessionId();
      if (sessionId) {
        import("@/lib/analytics.functions").then(({ saveCollageCreation }) => saveCollageCreation({ data: { sessionId, imageDataUrl: dataUrl, formatId, sizeId, styleId, photoCount, caption, subtitle } }).catch(() => undefined));
      }
      toast.success("הקולאז׳ ירד למכשיר שלך");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ההורדה נכשלה, נסי שוב");
    } finally {
      setDownloading(false);
    }
  };

  const nextStep = () => setStep((current) => Math.min(4, current + 1) as Step);
  const previousStep = () => setStep((current) => Math.max(1, current - 1) as Step);

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-background py-8 md:py-12" dir="rtl">
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={onFilesSelected} />
      <div className="container-page">
        <header className="mx-auto mb-7 max-w-3xl text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-secondary bg-card px-4 py-2 text-xs font-semibold text-primary">
            <Sparkles className="h-4 w-4 text-secondary-foreground" /> חינם · בלי הרשמה · התמונות נשארות במכשיר שלך
          </div>
          <h1 className="font-display text-4xl text-primary md:text-6xl">יוצר הקולאז׳ים של Sweetbaby</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">בוחרים גודל ורעיון, מעלים תמונות ומעצבים מזכרת ברמה מקצועית.</p>
        </header>

        <nav aria-label="שלבי יצירת הקולאז׳" className="mx-auto mb-7 flex max-w-2xl items-center justify-center gap-2 md:gap-3">
          {STEPS.map((item) => (
            <div key={item.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <span className={`h-1.5 w-full rounded-full transition-colors ${step >= item.id ? "bg-secondary" : "bg-muted"}`} />
              <span className={`text-xs font-semibold ${step === item.id ? "text-primary" : "text-muted-foreground"}`}>{item.id}. {item.label}</span>
            </div>
          ))}
        </nav>

        <section className={`mx-auto overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-soft)] ${step === 4 ? "max-w-6xl" : "max-w-4xl"}`}>
          <div className="p-5 md:p-9">
            {step === 1 && (
              <div>
                <div className="mb-8 text-center">
                  <span className="text-sm font-semibold text-secondary-foreground">שלב ראשון</span>
                  <h2 className="mt-1 font-display text-3xl text-primary">בחרי את הגודל הרצוי</h2>
                  <p className="mt-2 text-sm text-muted-foreground">להדפסה, לטלפון או לרשתות החברתיות</p>
                </div>
                <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {CARD_FORMATS.map((format) => (
                    <Button key={format.id} type="button" variant="outline" onClick={() => changeFormat(format.id)} className={`h-40 flex-col gap-4 rounded-2xl border-2 ${formatId === format.id ? "border-secondary bg-secondary/20" : "border-border bg-card"}`}>
                      <SizeIcon format={format.id} />
                      <span className="text-base text-primary">{format.label}</span>
                      {formatId === format.id && <Check className="absolute left-3 top-3 h-5 w-5 rounded-full bg-secondary p-1 text-secondary-foreground" />}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {CARD_SIZES[formatId].map((size) => {
                    const ratio = size.wCm / size.hCm;
                    const boxW = ratio >= 1 ? 112 : Math.round(112 * ratio);
                    const boxH = ratio >= 1 ? Math.round(112 / ratio) : 112;
                    const active = sizeId === size.id;
                    return (
                      <button
                        key={size.id}
                        type="button"
                        onClick={() => setSizeId(size.id)}
                        className={`flex flex-col items-center gap-3 rounded-2xl border-2 p-4 transition-colors ${active ? "border-secondary bg-secondary/15" : "border-border bg-background hover:border-secondary/60"}`}
                      >
                        <span className="flex h-32 items-center justify-center">
                          <span className="block overflow-hidden rounded-md border border-border bg-card p-1 shadow-sm" style={{ width: boxW, height: boxH }}>
                            <span className="grid h-full w-full grid-cols-3 grid-rows-3 gap-[2px]">
                              <i className="col-span-2 row-span-2 rounded-sm bg-secondary/70" />
                              <i className="rounded-sm bg-accent/50" />
                              <i className="rounded-sm bg-muted" />
                              <i className="col-span-3 rounded-sm bg-primary/15" />
                            </span>
                          </span>
                        </span>
                        <span className="text-center">
                          <span className="block text-sm font-semibold text-primary">{size.label}</span>
                          <span className="block text-xs text-muted-foreground">{size.use ?? `${size.wCm}×${size.hCm} ס״מ`}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

              </div>
            )}

            {step === 2 && (
              <div>
                <div className="mb-6 text-center">
                  <span className="text-sm font-semibold text-secondary-foreground">שלב שני</span>
                  <h2 className="mt-1 font-display text-3xl text-primary">איזה סיפור תרצי ליצור?</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{COLLAGE_IDEAS.length} רעיונות מקוריים בהשראת קולאז׳ים מודפסים ופינטרסט</p>
                </div>
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש רעיון (למשל: חנוכה, פולארויד, ניו בורן)" aria-label="חיפוש רעיון" className="mx-auto mb-4 max-w-md" />
                <div className="mb-6 flex gap-2 overflow-x-auto pb-2">

                  {COLLAGE_IDEA_CATEGORIES.map((item) => (
                    <Button key={item.id} type="button" variant={category === item.id ? "default" : "outline"} size="sm" onClick={() => setCategory(item.id)} className="shrink-0 rounded-full">{item.label}</Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {ideas.map((item) => (
                    <Button key={item.id} type="button" variant="outline" onClick={() => selectIdea(item.id)} className={`h-auto min-h-56 flex-col items-stretch justify-start gap-0 overflow-hidden rounded-2xl p-0 text-right whitespace-normal ${ideaId === item.id ? "border-secondary ring-2 ring-secondary/40" : "border-border"}`}>
                      <div className="w-full bg-background p-3"><IdeaPreview motif={item.motif} /></div>
                      <span className="flex w-full flex-col p-3">
                        <span className="flex items-center justify-between gap-2 font-semibold text-primary"><span>{item.name}</span><span className="text-xs text-muted-foreground">{item.photoCount} תמונות</span></span>
                        <span className="mt-1 text-xs font-normal text-muted-foreground">{item.description}</span>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <div className="mb-7 text-center">
                  <span className="text-sm font-semibold text-secondary-foreground">שלב שלישי</span>
                  <h2 className="mt-1 font-display text-3xl text-primary">העלי את התמונות שלך</h2>
                  <p className="mt-2 text-sm text-muted-foreground">אפשר לבחור כמה תמונות יחד, ולהחליף כל אחת בלחיצה</p>
                </div>
                <Button type="button" onClick={() => openPicker()} className="mx-auto mb-7 flex h-14 rounded-full bg-secondary px-8 text-secondary-foreground hover:bg-secondary/85">
                  <ImagePlus className="h-5 w-5" /> בחירת תמונות מהמכשיר
                </Button>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {photos.map((photo, index) => (
                    <div key={index} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-background">
                      {photo ? <img src={photo} alt={`תמונה ${index + 1} לקולאז׳`} className="h-full w-full object-cover" /> : <button type="button" onClick={() => openPicker(index)} className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground"><ImagePlus className="h-6 w-6" /><span className="text-xs">תמונה {index + 1}</span></button>}
                      {photo && <div className="absolute inset-x-2 bottom-2 flex justify-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><Button type="button" size="icon" variant="secondary" aria-label={`החלפת תמונה ${index + 1}`} onClick={() => openPicker(index)}><Images /></Button><Button type="button" size="icon" variant="destructive" aria-label={`מחיקת תמונה ${index + 1}`} onClick={() => setPhotos((current) => current.map((item, itemIndex) => itemIndex === index ? null : item))}><Trash2 /></Button></div>}
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-center text-sm text-muted-foreground">הועלו {uploadedCount} מתוך {photoCount} תמונות · אפשר להמשיך גם עם משבצות ריקות</p>
              </div>
            )}

            {step === 4 && (
              <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,390px)]">
                <div className="lg:sticky lg:top-24">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div><span className="text-xs font-semibold text-secondary-foreground">תצוגה חיה</span><h2 className="font-display text-2xl text-primary">הקולאז׳ שלך</h2></div>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" /> התמונות לא נשלחות לשום מקום</span>
                  </div>
                  <div className="mx-auto max-w-lg"><CollageCard svgRef={svgRef} cardW={dimensions.w} cardH={dimensions.h} styleId={styleId} photos={photos} layoutId={layoutId} shape={shape} effect={effect} frame={frame} borderStyle={borderStyle} captionPlacement={captionPlacement} paletteOverride={palette} decorId={decorId} caption={caption} subtitle={subtitle} onSlotClick={openPicker} /></div>
                </div>
                <div className="space-y-5">
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <h3 className="mb-3 flex items-center gap-2 font-semibold text-primary"><LayoutGrid className="h-4 w-4" /> פריסה</h3>
                    <div className="flex flex-wrap gap-2">{layouts.map((item) => <Button key={item.id} type="button" size="sm" variant={layoutId === item.id ? "default" : "outline"} onClick={() => setLayoutId(item.id)} className="rounded-full">{item.label}</Button>)}</div>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <h3 className="mb-3 flex items-center gap-2 font-semibold text-primary"><WandSparkles className="h-4 w-4" /> סגנון וצורה</h3>
                    <div className="mb-3 grid grid-cols-3 gap-2">{COLLAGE_STYLES.map((item) => <Button key={item.id} type="button" size="sm" variant={styleId === item.id ? "default" : "outline"} onClick={() => setStyleId(item.id)}>{item.label}</Button>)}</div>
                    <div className="flex flex-wrap gap-2">{PHOTO_SHAPES.map((item) => <Button key={item.id} type="button" size="sm" variant={shape === item.id ? "secondary" : "outline"} onClick={() => setShape(item.id)} className="rounded-full">{item.label}</Button>)}</div>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <h3 className="mb-3 flex items-center gap-2 font-semibold text-primary"><Palette className="h-4 w-4" /> צבעים ואפקטים</h3>
                    <div className="mb-3 grid grid-cols-6 gap-2">{COLOR_PALETTES.map((item) => <Button key={item.id} type="button" variant="outline" size="icon" title={item.label} aria-label={item.label} onClick={() => setPalette({ bg: item.bg, accent: item.accent, captionColor: item.captionColor })} className="overflow-hidden rounded-full border-2 p-0"><span className="h-full w-1/2" style={{ backgroundColor: item.bg }} /><span className="h-full w-1/2" style={{ backgroundColor: item.accent }} /></Button>)}</div>
                    <div className="flex flex-wrap gap-2">{PHOTO_EFFECTS.map((item) => <Button key={item.id} type="button" size="sm" variant={effect === item.id ? "default" : "outline"} onClick={() => setEffect(item.id)} className="rounded-full">{item.label}</Button>)}</div>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <h3 className="mb-3 flex items-center gap-2 font-semibold text-primary"><Type className="h-4 w-4" /> כיתוב</h3>
                    <Input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={40} aria-label="כותרת הקולאז׳" className="mb-2" />
                    <Input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} maxLength={60} aria-label="כיתוב משנה" />
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <h3 className="mb-3 font-semibold text-primary">גימורים</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" size="sm" variant={borderStyle === "polaroid" ? "secondary" : "outline"} onClick={() => setBorderStyle(borderStyle === "polaroid" ? "none" : "polaroid")}>מסגרת פולארויד</Button>
                      <Button type="button" size="sm" variant={frame ? "secondary" : "outline"} onClick={() => setFrame(!frame)}>קו מסגרת</Button>
                      <Button type="button" size="sm" variant={captionPlacement === "overlay" ? "secondary" : "outline"} onClick={() => setCaptionPlacement(captionPlacement === "overlay" ? "below" : "overlay")}>כיתוב על התמונה</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setDecorId(decorId === "none" ? "newborn" : "none")}>קישוטים</Button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">{DECOR_THEMES.map((item) => <Button key={item.id} type="button" size="sm" variant={decorId === item.id ? "default" : "ghost"} onClick={() => setDecorId(item.id)}>{item.label}</Button>)}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button type="button" onClick={() => download("jpeg")} disabled={downloading} className="h-12 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/85">{downloading ? <Loader2 className="animate-spin" /> : <Download />} הורדת JPG</Button>
                    <Button type="button" onClick={() => download("png")} disabled={downloading} className="h-12 rounded-xl"><Download /> הורדת PNG</Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <footer className="flex flex-col-reverse items-center justify-between gap-3 border-t border-border bg-background px-5 py-4 sm:flex-row md:px-9">
            {step > 1 ? <Button type="button" variant="ghost" onClick={previousStep} className="w-full rounded-full sm:w-auto"><ArrowRight /> חזרה</Button> : <Link to="/" className="inline-flex min-h-10 items-center px-4 text-sm text-muted-foreground">חזרה לאתר</Link>}
            {step < 4 ? <Button type="button" onClick={nextStep} className="h-12 w-full rounded-full bg-secondary px-8 text-secondary-foreground hover:bg-secondary/85 sm:w-auto">{step === 1 ? "המשך לבחירת רעיון" : step === 2 ? "המשך להעלאת תמונות" : "המשך לעיצוב"}<ArrowLeft /></Button> : <Button type="button" variant="outline" onClick={() => setStep(1)} className="w-full rounded-full sm:w-auto">יצירת קולאז׳ חדש</Button>}
          </footer>
        </section>

        <div className="mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span>✓ חינם לגמרי</span><span>✓ ללא הרשמה</span><span>✓ מותאם להדפסה</span><span>✓ PNG ו־JPG באיכות גבוהה</span>
        </div>
      </div>
    </main>
  );
}
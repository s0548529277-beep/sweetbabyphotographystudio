// The real Canva-style editor screen: top toolbar, a right tool rail
// (image/text/element/color/preset/layer libraries — first in DOM order
// so it lands on the right in this RTL site), the canvas centered in the
// middle, and a left properties panel that's contextual to whatever's
// selected. StudioCanvas.tsx does the actual fabric.js work; this file is
// UI plumbing that calls its imperative handle.
import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  StudioCanvas,
  type StudioCanvasHandle,
  type SelectionInfo,
  type LayerInfo,
} from "./StudioCanvas";
import type { CollageTemplate } from "@/lib/collage-studio-data";
import {
  STUDIO_TEXT_PRESETS,
  STUDIO_TEXT_PRESETS_EN,
  STUDIO_FONTS,
  STUDIO_FONT_CATEGORY_LABELS,
  STUDIO_FONT_LANG_LABELS,
  STUDIO_PALETTES,
  ELEMENT_CATEGORIES,
  ELEMENT_LIBRARY,
  DESIGN_PRESETS,
  type ElementCategoryId,
  type StudioFontLang,
  type StudioFontCategory,
} from "@/lib/collage-studio-library";
import {
  ArrowRight,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Download,
  Trash2,
  Copy,
  RotateCw,
  FlipHorizontal2,
  ChevronUp,
  ChevronDown,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Type,
  Sparkles,
  Palette,
  Wand2,
  Layers as LayersIcon,
  Upload,
} from "lucide-react";

type TabId = "images" | "text" | "elements" | "colors" | "presets" | "layers";

const TABS: { id: TabId; label: string; icon: typeof ImageIcon }[] = [
  { id: "images", label: "תמונות", icon: ImageIcon },
  { id: "text", label: "טקסט", icon: Type },
  { id: "elements", label: "אלמנטים", icon: Sparkles },
  { id: "colors", label: "צבעים", icon: Palette },
  { id: "presets", label: "עיצובים מוכנים", icon: Wand2 },
  { id: "layers", label: "שכבות", icon: LayersIcon },
];

// Groups the flat STUDIO_FONTS list into (lang → category → fonts) sections
// for the font <Select>, in a fixed, deliberate order (Hebrew before
// English, sans before serif before script within each) rather than
// whatever order the source array happens to list them in.
const FONT_GROUP_ORDER: { lang: StudioFontLang; category: StudioFontCategory }[] = [
  { lang: "he", category: "sans" },
  { lang: "he", category: "serif" },
  { lang: "he", category: "script" },
  { lang: "en", category: "sans" },
  { lang: "en", category: "serif" },
  { lang: "en", category: "script" },
];
const FONT_GROUPS = FONT_GROUP_ORDER.map((g) => ({
  ...g,
  label: `${STUDIO_FONT_LANG_LABELS[g.lang]} · ${STUDIO_FONT_CATEGORY_LABELS[g.category]}`,
  fonts: STUDIO_FONTS.filter((f) => f.lang === g.lang && f.category === g.category),
})).filter((g) => g.fonts.length > 0);

function readFilesAsDataUrls(files: FileList): Promise<string[]> {
  return Promise.all(
    Array.from(files).map(
      (f) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(f);
        })
    )
  );
}

export function StudioEditor({ template }: { template: CollageTemplate }) {
  const canvasHandleRef = useRef<StudioCanvasHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const [selection, setSelection] = useState<SelectionInfo>({ kind: "none" });
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [tab, setTab] = useState<TabId>("images");
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [elementCategory, setElementCategory] = useState<ElementCategoryId>("flowers");
  const [textLang, setTextLang] = useState<StudioFontLang>("he");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [downloading, setDownloading] = useState(false);

  const zoomBy = (factor: number) => {
    canvasHandleRef.current?.zoom(factor);
    setZoomLevel((z) => Math.min(3, Math.max(0.2, z * factor)));
  };

  const onUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    try {
      const urls = await readFilesAsDataUrls(fileList);
      const withIds = urls.map((url, i) => ({ id: `photo-${Date.now()}-${i}`, url }));
      setPhotos((prev) => [...prev, ...withIds]);
      // Real convenience, not just an upload dump: try to place each new
      // photo straight into the next empty frame as it's added.
      for (const p of withIds) {
        await canvasHandleRef.current?.assignToSelectedOrNextEmptyFrame(p.url);
      }
    } catch {
      toast.error("העלאת התמונות נכשלה, נסי שוב");
    }
  };

  const onThumbnailClick = async (url: string) => {
    const placed = await canvasHandleRef.current?.assignToSelectedOrNextEmptyFrame(url);
    if (!placed) toast.info("כל המשבצות תפוסות — לחצי על תמונה בקנבס ואז על תמונה כאן כדי להחליף");
  };

  const onCanvasDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    const photo = photos.find((p) => p.id === id);
    if (!photo || !wrapperRef.current) return;
    const canvasEl = wrapperRef.current.querySelector("canvas");
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoomLevel;
    const y = (e.clientY - rect.top) / zoomLevel;
    const placed = await canvasHandleRef.current?.assignImageAtPoint(photo.url, x, y);
    if (!placed) toast.info("שחררי את התמונה בדיוק מעל אחת המשבצות");
  };

  const onReplaceSelected = () => replaceInputRef.current?.click();
  const onReplaceFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const [url] = await readFilesAsDataUrls(e.target.files as FileList);
    await canvasHandleRef.current?.replaceSelectedImage(url);
  };

  const onReplaceAll = async () => {
    if (photos.length === 0) {
      toast.error("צריך להעלות תמונות קודם");
      return;
    }
    await canvasHandleRef.current?.assignImagesSequentially(photos.map((p) => p.url));
    toast.success("כל התמונות הוחלפו");
  };

  const download = async () => {
    setDownloading(true);
    try {
      const dataUrl = await canvasHandleRef.current?.exportPNG(3);
      if (!dataUrl) return;
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${template.name}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("הקובץ מוכן להדפסה");
    } finally {
      setDownloading(false);
    }
  };

  const hasSelection = selection.kind !== "none";

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f1ea]" dir="rtl">
      {/* Top toolbar */}
      <div className="h-16 shrink-0 border-b border-black/10 bg-white flex items-center gap-3 px-4">
        <Link to="/collage-studio" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline shrink-0">
          <ArrowRight className="h-4 w-4" /> חזרה לתבניות
        </Link>
        <div className="h-6 w-px bg-black/10 mx-1" />
        <div className="font-display text-lg text-primary truncate">{template.name}</div>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <ToolIconButton icon={Undo2} label="בטל" onClick={() => canvasHandleRef.current?.undo()} />
          <ToolIconButton icon={Redo2} label="בצע שוב" onClick={() => canvasHandleRef.current?.redo()} />
          <div className="h-6 w-px bg-black/10 mx-1" />
          <ToolIconButton icon={ZoomOut} label="הקטן" onClick={() => zoomBy(0.9)} />
          <span className="text-xs w-10 text-center text-muted-foreground">{Math.round(zoomLevel * 100)}%</span>
          <ToolIconButton icon={ZoomIn} label="הגדל" onClick={() => zoomBy(1.1)} />
          <div className="h-6 w-px bg-black/10 mx-1" />
          <ToolIconButton icon={Trash2} label="מחיקה" disabled={!hasSelection} onClick={() => canvasHandleRef.current?.deleteSelected()} />
          <ToolIconButton icon={Copy} label="שכפול" disabled={!hasSelection} onClick={() => canvasHandleRef.current?.duplicateSelected()} />
          <ToolIconButton icon={RotateCw} label="סיבוב" disabled={!hasSelection} onClick={() => canvasHandleRef.current?.rotateSelected(15)} />
          <ToolIconButton icon={FlipHorizontal2} label="היפוך" disabled={!hasSelection} onClick={() => canvasHandleRef.current?.flipSelected()} />
          <ToolIconButton icon={ChevronUp} label="קדימה" disabled={!hasSelection} onClick={() => canvasHandleRef.current?.bringForward()} />
          <ToolIconButton icon={ChevronDown} label="אחורה" disabled={!hasSelection} onClick={() => canvasHandleRef.current?.sendBackward()} />
          <ToolIconButton
            icon={selection.kind !== "none" && layers.find((l) => l.id === (selection as any).id)?.locked ? Unlock : Lock}
            label="נעילה"
            disabled={!hasSelection}
            onClick={() => canvasHandleRef.current?.toggleLockSelected()}
          />
        </div>

        <div className="h-6 w-px bg-black/10 mx-1" />
        <Button onClick={download} disabled={downloading} className="rounded-full gap-2">
          <Download className="h-4 w-4" /> {downloading ? "מכינה..." : "הורדה"}
        </Button>
      </div>

      {/* 3-column layout — RTL, so source order 1 renders rightmost */}
      <div className="flex-1 grid" style={{ gridTemplateColumns: "320px 1fr 300px" }}>
        {/* Right rail: tool tabs + content */}
        <div className="border-s border-black/10 bg-white flex flex-col overflow-hidden">
          <div className="grid grid-cols-3 gap-1 p-2 border-b border-black/10 shrink-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] transition-colors ${
                  tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-black/5"
                }`}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "images" && (
              <div className="space-y-3">
                <input ref={uploadInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onUploadFiles(e.target.files)} />
                <Button variant="outline" className="w-full rounded-full gap-2" onClick={() => uploadInputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> העלאת תמונות
                </Button>
                {photos.length > 1 && (
                  <Button variant="outline" size="sm" className="w-full rounded-full" onClick={onReplaceAll}>
                    החלפת כל התמונות בבת אחת
                  </Button>
                )}
                <p className="text-[11px] text-muted-foreground">גררי תמונה למשבצת, או לחצי עליה כדי למלא את המשבצת הפנויה הבאה.</p>
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p) => (
                    <img
                      key={p.id}
                      src={p.url}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                      onClick={() => onThumbnailClick(p.url)}
                      className="aspect-square object-cover rounded-lg border border-black/10 cursor-pointer hover:opacity-80"
                      alt=""
                    />
                  ))}
                </div>
              </div>
            )}

            {tab === "text" && (
              <div className="space-y-4">
                <Button variant="outline" className="w-full rounded-full" onClick={() => canvasHandleRef.current?.addCustomText()}>
                  הוספת טקסט חופשי
                </Button>
                <div className="inline-flex rounded-full border border-primary/15 p-0.5 bg-[#faf8f3]">
                  {(["he", "en"] as const).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setTextLang(lang)}
                      className={`text-xs rounded-full px-3 py-1.5 transition-colors ${
                        textLang === lang ? "bg-primary text-primary-foreground" : "text-primary"
                      }`}
                    >
                      {STUDIO_FONT_LANG_LABELS[lang]}
                    </button>
                  ))}
                </div>
                {(textLang === "he" ? STUDIO_TEXT_PRESETS : STUDIO_TEXT_PRESETS_EN).map((g) => (
                  <div key={g.group}>
                    <div className="text-[11px] tracking-[0.2em] uppercase text-forest/70 mb-1.5">{g.group}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.items.map((item) => (
                        <button
                          key={item.text}
                          type="button"
                          onClick={() => canvasHandleRef.current?.addTextPreset(item.text, item.subtitle)}
                          className="text-xs rounded-full border border-primary/15 hover:border-primary px-3 py-1.5 text-primary transition-colors"
                        >
                          {item.text}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "elements" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {ELEMENT_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setElementCategory(c.id)}
                      className={`text-xs rounded-full border px-3 py-1.5 transition-colors ${
                        elementCategory === c.id ? "bg-primary text-primary-foreground border-primary" : "border-primary/15 text-primary hover:border-primary"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {ELEMENT_LIBRARY.filter((e) => e.category === elementCategory).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      title={e.label}
                      onClick={() => canvasHandleRef.current?.addElement(e.id)}
                      className="aspect-square rounded-lg border border-black/10 hover:border-primary p-2 bg-[#faf8f3]"
                      dangerouslySetInnerHTML={{ __html: e.svg("#5a4a30") }}
                    />
                  ))}
                </div>
              </div>
            )}

            {tab === "colors" && (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-primary mb-2">פלטות מוכנות</div>
                  <div className="grid grid-cols-2 gap-2">
                    {STUDIO_PALETTES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        title={p.label}
                        onClick={() => {
                          canvasHandleRef.current?.setBackgroundColor(p.bg);
                          if (hasSelection) canvasHandleRef.current?.updateSelectedColor(p.accent);
                        }}
                        className="h-10 rounded-xl border border-black/10 flex overflow-hidden"
                      >
                        <span className="w-1/2 h-full" style={{ background: p.bg }} />
                        <span className="w-1/2 h-full" style={{ background: p.accent }} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-primary mb-2">בורר צבעים</div>
                  <input
                    type="color"
                    className="w-full h-10 rounded-xl border border-black/10"
                    onChange={(e) => (hasSelection ? canvasHandleRef.current?.updateSelectedColor(e.target.value) : canvasHandleRef.current?.setBackgroundColor(e.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">בלי לבחור אלמנט — משנה את צבע הרקע. עם אלמנט נבחר — משנה את צבעו.</p>
                </div>
              </div>
            )}

            {tab === "presets" && (
              <div className="space-y-2">
                {DESIGN_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => canvasHandleRef.current?.applyDesignPreset(p)}
                    className="w-full text-right rounded-xl border border-primary/15 hover:border-primary p-3 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="h-6 w-6 rounded-full shrink-0" style={{ background: p.palette.accent }} />
                      <span className="text-sm font-semibold text-primary">{p.label}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{p.description}</p>
                  </button>
                ))}
              </div>
            )}

            {tab === "layers" && (
              <div className="space-y-1.5">
                {layers.length === 0 && <p className="text-xs text-muted-foreground">אין עדיין שכבות.</p>}
                {layers.map((l) => (
                  <div
                    key={l.id}
                    onClick={() => canvasHandleRef.current?.selectLayer(l.id)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 cursor-pointer text-xs transition-colors ${
                      l.selected ? "border-primary bg-primary/5" : "border-black/10 hover:border-primary/40"
                    }`}
                  >
                    <span className="flex-1 truncate text-primary">{l.label}</span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); canvasHandleRef.current?.reorderLayer(l.id, "up"); }} title="קדימה">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); canvasHandleRef.current?.reorderLayer(l.id, "down"); }} title="אחורה">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); canvasHandleRef.current?.toggleHideLayer(l.id); }} title="הצג/הסתר">
                      {l.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: canvas */}
        <div
          ref={wrapperRef}
          className="overflow-auto flex items-center justify-center p-10 bg-[repeating-conic-gradient(#eee_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onCanvasDrop}
        >
          <StudioCanvas
            ref={canvasHandleRef}
            template={template}
            onSelectionChange={setSelection}
            onLayersChange={setLayers}
          />
        </div>

        {/* Left: contextual properties */}
        <div className="border-e border-black/10 bg-white p-4 overflow-y-auto">
          <input ref={replaceInputRef} type="file" accept="image/*" className="hidden" onChange={onReplaceFileChosen} />
          {selection.kind === "none" && (
            <div className="text-sm text-muted-foreground">
              בחרי אלמנט בקנבס כדי לערוך אותו, או השתמשי בטאב הצבעים כדי לשנות את צבע הרקע.
            </div>
          )}
          {selection.kind === "image" && (
            <div className="space-y-3">
              <div className="font-display text-lg text-primary">תמונה</div>
              <Button variant="outline" className="w-full rounded-full" onClick={onReplaceSelected}>
                {selection.hasPhoto ? "החלפת תמונה" : "העלאת תמונה למשבצת"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                גררי בקנבס כדי להזיז, גררי מהפינה כדי לשנות גודל, וגררי את ידית הסיבוב למעלה כדי לסובב — המסגרת נשארת בדיוק כפי שהיא.
              </p>
            </div>
          )}
          {selection.kind === "text" && (
            <div className="space-y-4">
              <div className="font-display text-lg text-primary">טקסט</div>
              <Input
                value={selection.text}
                onChange={(e) => canvasHandleRef.current?.updateSelectedText({ text: e.target.value })}
                dir="rtl"
              />
              <div>
                <label className="text-xs text-muted-foreground">גופן</label>
                <Select value={selection.fontFamily} onValueChange={(v) => canvasHandleRef.current?.updateSelectedText({ fontFamily: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FONT_GROUPS.map((g) => (
                      <SelectGroup key={`${g.lang}-${g.category}`}>
                        <SelectLabel>{g.label}</SelectLabel>
                        {g.fonts.map((f) => (
                          <SelectItem key={f.id} value={f.family} style={{ fontFamily: f.family }}>{f.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">גודל — {selection.fontSize}</label>
                <Slider min={14} max={140} step={1} value={[selection.fontSize]} onValueChange={([v]) => canvasHandleRef.current?.updateSelectedText({ fontSize: v })} className="mt-2" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">צבע</label>
                <input type="color" value={selection.color} onChange={(e) => canvasHandleRef.current?.updateSelectedText({ color: e.target.value })} className="w-full h-9 rounded-lg border border-black/10 mt-1" />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => canvasHandleRef.current?.updateSelectedText({ bold: !selection.bold })}
                  className={`flex-1 rounded-full border py-1.5 text-sm font-bold transition-colors ${selection.bold ? "bg-primary text-primary-foreground border-primary" : "border-primary/20"}`}
                >
                  B
                </button>
                {(["right", "center", "left"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => canvasHandleRef.current?.updateSelectedText({ align: a })}
                    className="flex-1 rounded-full border border-primary/20 py-1.5 text-xs hover:border-primary"
                  >
                    {a === "right" ? "ימין" : a === "center" ? "מרכז" : "שמאל"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {selection.kind === "shape" && (
            <div className="space-y-3">
              <div className="font-display text-lg text-primary">אלמנט</div>
              <label className="text-xs text-muted-foreground">צבע</label>
              <input type="color" value={selection.color} onChange={(e) => canvasHandleRef.current?.updateSelectedColor(e.target.value)} className="w-full h-9 rounded-lg border border-black/10" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolIconButton({ icon: Icon, label, onClick, disabled }: { icon: typeof Undo2; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-9 w-9 rounded-lg flex items-center justify-center text-primary hover:bg-black/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

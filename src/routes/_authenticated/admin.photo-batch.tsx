import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sliders, Download, FolderOpen, Images } from "lucide-react";
import { applyAdjustments, drawAdjustedToCanvas, DEFAULT_ADJUST, ADJUST_PRESETS, type AdjustSettings } from "@/lib/image-adjust";

export const Route = createFileRoute("/_authenticated/admin/photo-batch")({
  component: PhotoBatchAdmin,
});

function ControlRow({
  label,
  value,
  onChange,
  min = -100,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <label className="font-medium">{label}</label>
        <span className="text-muted-foreground tabular-nums" dir="ltr">
          {value > 0 ? "+" : ""}
          {value}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={([v]) => onChange(v)}
        className="mt-1.5"
        dir="rtl"
      />
    </div>
  );
}

function PhotoBatchAdmin() {
  const [files, setFiles] = useState<File[]>([]);
  const [settings, setSettings] = useState<AdjustSettings>(DEFAULT_ADJUST);
  const [processing, setProcessing] = useState<{ done: number; total: number } | null>(null);

  const beforeCanvasRef = useRef<HTMLCanvasElement>(null);
  const afterCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const previewFile = files[0] ?? null;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (picked.length === 0) {
      toast.error("לא נמצאו קובצי תמונה בבחירה");
      return;
    }
    setFiles((prev) => [...prev, ...picked]);
  };

  // Redraw the "before" preview whenever the first file changes.
  useEffect(() => {
    if (!previewFile || !beforeCanvasRef.current) return;
    drawAdjustedToCanvas(previewFile, DEFAULT_ADJUST, beforeCanvasRef.current).catch(() => {});
  }, [previewFile]);

  // Redraw the "after" (live) preview whenever settings or the file change.
  useEffect(() => {
    if (!previewFile || !afterCanvasRef.current) return;
    const t = setTimeout(() => {
      if (afterCanvasRef.current) drawAdjustedToCanvas(previewFile, settings, afterCanvasRef.current).catch(() => {});
    }, 80);
    return () => clearTimeout(t);
  }, [previewFile, settings]);

  const processAndDownload = async () => {
    if (files.length === 0) return;
    setProcessing({ done: 0, total: files.length });
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let i = 0; i < files.length; i++) {
        const blob = await applyAdjustments(files[i], settings);
        const baseName = files[i].name.replace(/\.[^.]+$/, "");
        zip.file(`${baseName}-edited.jpg`, blob);
        setProcessing({ done: i + 1, total: files.length });
        // Yield to the UI thread between images so the progress bar/browser stays responsive.
        await new Promise((r) => setTimeout(r, 0));
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `תמונות-מעובדות-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${files.length} תמונות עובדו והורדו`);
    } catch (e: any) {
      toast.error(e?.message ?? "העיבוד נכשל");
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          <Sliders className="h-5 w-5" /> כיוונון תמונות בכמות גדולה
        </h2>
        <p className="text-sm text-muted-foreground">
          לוח כיוונונים כמו ב-Camera Raw (בהירות, ניגודיות, חיזוק צבע, טון צבע, אורות/צללים בנפרד, טונציה מפוצלת, החשכת רקע) — מפעילים על תמונה אחת לתצוגה מקדימה, ואז מריצים על כל התמונות שנבחרו יחד ומורידים ZIP אחד. עיבוד מדויק וקבוע (לא בינה מלאכותית), אין עלות לכל תמונה, אפשר לעבד כמה שרוצים. הכיוונון של אורות וצללים בנפרד, ועם טונציה מפוצלת (צבע שונה לצללים מול אורות), מאפשר "גרייד" קולנוגרפי אמיתי במקום פילטר אחיד על כל התמונה.
        </p>
      </div>

      {/* Upload */}
      <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-3">
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="rounded-full">
            <Images className="h-4 w-4 ml-2" /> בחירת תמונות
          </Button>
          <Button type="button" variant="outline" onClick={() => folderInputRef.current?.click()} className="rounded-full">
            <FolderOpen className="h-4 w-4 ml-2" /> בחירת תיקייה שלמה
          </Button>
          {files.length > 0 && (
            <Button type="button" variant="ghost" onClick={() => setFiles([])} className="rounded-full text-destructive">
              ניקוי הבחירה ({files.length})
            </Button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <input
          ref={folderInputRef}
          type="file"
          accept="image/*"
          multiple
          // @ts-expect-error non-standard attribute, supported by Chrome/Edge/Safari for whole-folder picking
          webkitdirectory=""
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        {files.length > 0 && <p className="text-sm text-muted-foreground">{files.length} תמונות נבחרו</p>}
      </div>

      {/* Controls + live preview */}
      {previewFile && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-5">
            <div>
              <label className="text-sm font-medium">סגנון קבוע (התחלה מהירה)</label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {Object.entries(ADJUST_PRESETS).map(([key, preset]) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSettings(preset.settings)}
                    className="rounded-full"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">בחירת סגנון ממלאת את הכיוונונים למטה כנקודת פתיחה — עדיין אפשר לדייק אותם ידנית לפני העיבוד.</p>
            </div>
            <ControlRow label="בהירות" value={settings.brightness} onChange={(v) => setSettings((s) => ({ ...s, brightness: v }))} />
            <ControlRow label="ניגודיות" value={settings.contrast} onChange={(v) => setSettings((s) => ({ ...s, contrast: v }))} />
            <ControlRow label="חיזוק צבע (רוויה)" value={settings.saturation} onChange={(v) => setSettings((s) => ({ ...s, saturation: v }))} />
            <ControlRow label="טון צבע (קר ⟷ חם)" value={settings.temperature} onChange={(v) => setSettings((s) => ({ ...s, temperature: v }))} />
            <ControlRow label="אורות (Highlights)" value={settings.highlights} onChange={(v) => setSettings((s) => ({ ...s, highlights: v }))} />
            <ControlRow label="צללים (Shadows)" value={settings.shadows} onChange={(v) => setSettings((s) => ({ ...s, shadows: v }))} />
            <ControlRow
              label="טונציה מפוצלת (צללים קרים/אורות חמים ⟷ צללים חמים/אורות קרים)"
              value={settings.splitTone}
              onChange={(v) => setSettings((s) => ({ ...s, splitTone: v }))}
            />
            <ControlRow label="החשכת רקע (וינייטה)" value={settings.vignette} min={0} max={100} onChange={(v) => setSettings((s) => ({ ...s, vignette: v }))} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setSettings(DEFAULT_ADJUST)}>
              איפוס
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">לפני</p>
              <canvas ref={beforeCanvasRef} className="w-full rounded-xl border border-primary/10" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">אחרי (תצוגה מקדימה חיה)</p>
              <canvas ref={afterCanvasRef} className="w-full rounded-xl border border-primary/10" />
            </div>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <Button onClick={processAndDownload} disabled={!!processing} className="rounded-full">
          <Download className="h-4 w-4 ml-2" />
          {processing ? `מעבד... ${processing.done}/${processing.total}` : `עיבוד כל ${files.length} התמונות והורדה (ZIP)`}
        </Button>
      )}
    </div>
  );
}

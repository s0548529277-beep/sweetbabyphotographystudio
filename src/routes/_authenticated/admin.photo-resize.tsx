import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Images, FolderOpen, Download, Droplets, Trash2, X } from "lucide-react";
import { resizeImage } from "@/lib/image-resize";
import { applyWatermark } from "@/lib/watermark";

export const Route = createFileRoute("/_authenticated/admin/photo-resize")({
  component: PhotoResizeAdmin,
});

type Item = { id: string; file: File; previewUrl: string; watermark: boolean };

/** Resizes (and, if selected, watermarks) one item to a real output File, per the current global settings. */
async function processItem(item: Item, maxDim: number, quality: number): Promise<File> {
  const resized = await resizeImage(item.file, maxDim, quality);
  return item.watermark ? applyWatermark(resized) : resized;
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function PhotoResizeAdmin() {
  const [items, setItems] = useState<Item[]>([]);
  const [maxDim, setMaxDim] = useState(1600);
  const [quality, setQuality] = useState(85);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs on unmount / when items are removed, so the browser
  // doesn't hold every uploaded image's blob in memory for the whole session.
  useEffect(() => {
    return () => {
      for (const it of items) URL.revokeObjectURL(it.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (picked.length === 0) {
      toast.error("לא נמצאו קובצי תמונה בבחירה");
      return;
    }
    const newItems: Item[] = picked.map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      watermark: false,
    }));
    setItems((prev) => [...prev, ...newItems]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const found = prev.find((it) => it.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  };

  const clearAll = () => {
    for (const it of items) URL.revokeObjectURL(it.previewUrl);
    setItems([]);
  };

  const toggleWatermark = (id: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, watermark: !it.watermark } : it)));
  };

  const allWatermarked = items.length > 0 && items.every((it) => it.watermark);
  const toggleWatermarkAll = () => {
    const next = !allWatermarked;
    setItems((prev) => prev.map((it) => ({ ...it, watermark: next })));
  };

  const downloadOne = async (item: Item) => {
    setBusyId(item.id);
    try {
      const result = await processItem(item, maxDim, quality);
      downloadFile(result);
    } catch (e: any) {
      toast.error(e?.message ?? "העיבוד נכשל");
    } finally {
      setBusyId(null);
    }
  };

  const downloadAll = async () => {
    if (items.length === 0) return;
    setZipping({ done: 0, total: items.length });
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let i = 0; i < items.length; i++) {
        const result = await processItem(items[i], maxDim, quality);
        zip.file(result.name, result);
        setZipping({ done: i + 1, total: items.length });
        await new Promise((r) => setTimeout(r, 0));
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `תמונות-מוקטנות-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${items.length} תמונות עובדו והורדו`);
    } catch (e: any) {
      toast.error(e?.message ?? "העיבוד נכשל");
    } finally {
      setZipping(null);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
          <Images className="h-5 w-5" /> הקטנת תמונות וסימן מים
        </h2>
        <p className="text-sm text-muted-foreground">
          מעלים תמונות, קובעים גודל יעד אחד לכולן, ובוחרים על אילו תמונות להוסיף סימן מים (על כולן ביחד, או כל תמונה
          בנפרד). הורדה אפשרית לכל תמונה בנפרד, או הכל יחד כקובץ ZIP.
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
          {items.length > 0 && (
            <Button type="button" variant="ghost" onClick={clearAll} className="rounded-full text-destructive">
              <Trash2 className="h-4 w-4 ml-2" /> ניקוי הכל ({items.length})
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
      </div>

      {items.length > 0 && (
        <>
          {/* Settings */}
          <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">גודל מקסימלי (פיקסלים בצד הארוך)</label>
                <Input
                  type="number"
                  min={200}
                  max={6000}
                  dir="ltr"
                  value={maxDim}
                  onChange={(e) => setMaxDim(Math.max(200, Number(e.target.value) || 200))}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="text-sm font-medium">איכות (%)</label>
                <Input
                  type="number"
                  min={10}
                  max={100}
                  dir="ltr"
                  value={quality}
                  onChange={(e) => setQuality(Math.min(100, Math.max(10, Number(e.target.value) || 10)))}
                  className="mt-1.5"
                />
              </div>
            </div>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer w-fit">
              <Checkbox checked={allWatermarked} onCheckedChange={toggleWatermarkAll} />
              <Droplets className="h-4 w-4 text-primary" />
              הוספת סימן מים על כל התמונות
            </label>
            <p className="text-xs text-muted-foreground">אפשר גם לסמן/לבטל סימן מים לתמונה ספציפית בכרטיסייה שלה למטה.</p>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {items.map((item) => (
              <div key={item.id} className="bg-card rounded-2xl border border-primary/10 overflow-hidden">
                <div className="relative aspect-square bg-muted">
                  <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="absolute top-1.5 left-1.5 h-6 w-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                    aria-label="הסרה"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="p-2.5 space-y-2">
                  <p className="text-[11px] text-muted-foreground truncate" title={item.file.name}>
                    {item.file.name}
                  </p>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={item.watermark} onCheckedChange={() => toggleWatermark(item.id)} />
                    <Droplets className="h-3.5 w-3.5 text-primary" /> סימן מים
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full rounded-full text-xs h-8"
                    disabled={busyId === item.id}
                    onClick={() => downloadOne(item)}
                  >
                    <Download className="h-3.5 w-3.5 ml-1" /> {busyId === item.id ? "מעבד..." : "הורדה"}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button onClick={downloadAll} disabled={!!zipping} className="rounded-full">
            <Download className="h-4 w-4 ml-2" />
            {zipping ? `מעבד... ${zipping.done}/${zipping.total}` : `עיבוד כל ${items.length} התמונות והורדה (ZIP)`}
          </Button>
        </>
      )}
    </div>
  );
}

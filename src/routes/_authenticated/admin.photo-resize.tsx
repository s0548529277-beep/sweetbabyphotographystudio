import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Images, FolderOpen, Download, Droplets, Trash2, X, Upload, Link2, UserRound } from "lucide-react";
import { resizeImage } from "@/lib/image-resize";
import { applyCustomWatermark, loadImageFile } from "@/lib/custom-watermark";
import { listPhotoClients, addPhotoClientImage } from "@/lib/photo-clients.functions";

export const Route = createFileRoute("/_authenticated/admin/photo-resize")({
  component: PhotoResizeAdmin,
});

type Item = {
  id: string;
  file: File;
  previewUrl: string;
  watermark: boolean;
  /** Set when this batch was linked to an existing newborn client at upload time — the processed result also syncs into her photo gallery, not just a local download. */
  clientWorkflowId: string | null;
  clientName: string | null;
};

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

/** Same storage-then-DB-record pattern as admin.photo-clients.$bookingId.tsx's UploadSection, reused here so a resized/watermarked result can land directly in that client's gallery instead of only a local download. */
async function syncResultToClient(result: File, workflowId: string, addImage: ReturnType<typeof useServerFn<typeof addPhotoClientImage>>) {
  const ext = result.name.split(".").pop() ?? "jpg";
  const path = `photo-clients/${workflowId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("items").upload(path, result, { upsert: false });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage.from("items").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה ביצירת קישור לתמונה");
  await addImage({ data: { workflowId, kind: "edited", storagePath: path, imageUrl: data.signedUrl } });
}

function PhotoResizeAdmin() {
  const [items, setItems] = useState<Item[]>([]);
  const [maxDim, setMaxDim] = useState(1600);
  const [quality, setQuality] = useState(85);

  // Watermark logo — uploaded by the admin, kept only in memory for this
  // session (not saved anywhere), so she can use whichever logo/stamp she
  // wants per batch instead of a fixed studio logo baked into the code.
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [watermarkSize, setWatermarkSize] = useState(22); // % of the image's shorter side
  const [watermarkOpacity, setWatermarkOpacity] = useState(34); // %

  const [busyId, setBusyId] = useState<string | null>(null);
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);

  // Files picked but not yet added — held here until she answers "existing
  // client or one-off" in the dialog below, per explicit request.
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const listClients = useServerFn(listPhotoClients);
  const addImage = useServerFn(addPhotoClientImage);
  const clientsQuery = useQuery({
    queryKey: ["photo-clients-for-resize-link"],
    queryFn: () => listClients(),
    enabled: pendingFiles !== null,
    staleTime: 30_000,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs on unmount, so the browser doesn't hold every
  // uploaded image's blob in memory for the whole session.
  useEffect(() => {
    return () => {
      for (const it of items) URL.revokeObjectURL(it.previewUrl);
      if (logoUrl) URL.revokeObjectURL(logoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickLogo = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file || !file.type.startsWith("image/")) {
      toast.error("נא לבחור קובץ תמונה ללוגו");
      return;
    }
    try {
      const img = await loadImageFile(file);
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      setLogoFile(file);
      setLogoImg(img);
      setLogoUrl(img.src);
    } catch {
      toast.error("טעינת הלוגו נכשלה");
    }
  };

  const clearLogo = () => {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    setLogoFile(null);
    setLogoImg(null);
    setLogoUrl(null);
  };

  /** Resizes (and, if selected + a logo is loaded, watermarks) one item to a real output File. */
  const processItem = async (item: Item): Promise<File> => {
    const resized = await resizeImage(item.file, maxDim, quality);
    if (!item.watermark) return resized;
    if (!logoImg) throw new Error("יש להעלות לוגו לסימן המים קודם");
    return applyCustomWatermark(resized, logoImg, watermarkSize, watermarkOpacity);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (picked.length === 0) {
      toast.error("לא נמצאו קובצי תמונה בבחירה");
      return;
    }
    setClientSearch("");
    setPendingFiles(picked);
  };

  const commitPendingFiles = (clientWorkflowId: string | null, clientName: string | null) => {
    if (!pendingFiles) return;
    const newItems: Item[] = pendingFiles.map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      watermark: false,
      clientWorkflowId,
      clientName,
    }));
    setItems((prev) => [...prev, ...newItems]);
    setPendingFiles(null);
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
    if (next && !logoImg) toast.error("כדאי להעלות לוגו קודם — בלי לוגו, סימן המים לא יתווסף בעת ההורדה");
    setItems((prev) => prev.map((it) => ({ ...it, watermark: next })));
  };

  /** Downloads locally, and — when this item is linked to a client — also uploads the same result into her gallery. */
  const deliverResult = async (item: Item, result: File) => {
    downloadFile(result);
    if (item.clientWorkflowId) {
      try {
        await syncResultToClient(result, item.clientWorkflowId, addImage);
      } catch (e: any) {
        toast.error(`הורדה בוצעה, אך הסנכרון לגלריית ${item.clientName ?? "הלקוחה"} נכשל: ${e?.message ?? "שגיאה"}`);
      }
    }
  };

  const downloadOne = async (item: Item) => {
    setBusyId(item.id);
    try {
      const result = await processItem(item);
      await deliverResult(item, result);
      if (item.clientWorkflowId) toast.success(`סונכרן לגלריית ${item.clientName ?? "הלקוחה"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "העיבוד נכשל");
    } finally {
      setBusyId(null);
    }
  };

  const downloadAll = async () => {
    if (items.length === 0) return;
    if (items.some((it) => it.watermark) && !logoImg) {
      toast.error("יש להעלות לוגו לסימן המים לפני ההורדה");
      return;
    }
    setZipping({ done: 0, total: items.length });
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      let syncedCount = 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const result = await processItem(item);
        zip.file(result.name, result);
        if (item.clientWorkflowId) {
          try {
            await syncResultToClient(result, item.clientWorkflowId, addImage);
            syncedCount++;
          } catch (e: any) {
            toast.error(`סנכרון ${result.name} ל-${item.clientName ?? "לקוחה"} נכשל: ${e?.message ?? "שגיאה"}`);
          }
        }
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
      toast.success(`${items.length} תמונות עובדו והורדו${syncedCount > 0 ? ` · ${syncedCount} סונכרנו ללקוחות` : ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "העיבוד נכשל");
    } finally {
      setZipping(null);
    }
  };

  const filteredClients = (clientsQuery.data ?? []).filter((c: any) => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return true;
    return (c.contact_name || "").toLowerCase().includes(q) || (c.contact_email || "").toLowerCase().includes(q) || (c.contact_phone || "").includes(q);
  });

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
            <Images className="h-5 w-5" /> הקטנת תמונות וסימן מים
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl">
            מעלים תמונות, קובעים גודל יעד אחד לכולן, ובוחרים על אילו תמונות להוסיף סימן מים (על כולן ביחד, או כל תמונה
            בנפרד). לפני כל העלאה נשאלת אם זה עבור לקוחת ניו-בורן קיימת (אז זה גם יסתנכרן לגלריה שלה) או חד-פעמי.
            הורדה אפשרית לכל תמונה בנפרד, או הכל יחד כקובץ ZIP.
          </p>
        </div>
        {items.length > 0 && (
          <Button onClick={downloadAll} disabled={!!zipping} className="rounded-full shrink-0">
            <Download className="h-4 w-4 ml-2" />
            {zipping ? `מעבד... ${zipping.done}/${zipping.total}` : `הורדת כל ${items.length} התמונות (ZIP)`}
          </Button>
        )}
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
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <input
          ref={folderInputRef}
          type="file"
          accept="image/*"
          multiple
          // @ts-expect-error non-standard attribute, supported by Chrome/Edge/Safari for whole-folder picking
          webkitdirectory=""
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {items.length > 0 && (
        <>
          {/* Settings */}
          <div className="bg-card rounded-2xl border border-primary/10 p-5 space-y-5">
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

            <div className="pt-4 border-t border-border space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Droplets className="h-4 w-4 text-primary" /> סימן מים
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {logoUrl ? (
                  <div className="flex items-center gap-2 bg-muted rounded-xl p-2">
                    <img src={logoUrl} alt="הלוגו שהועלה" className="h-10 w-10 object-contain rounded-md bg-background" />
                    <span className="text-xs text-muted-foreground truncate max-w-[140px]">{logoFile?.name}</span>
                    <button type="button" onClick={clearLogo} className="text-muted-foreground hover:text-destructive" aria-label="הסרת לוגו">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} className="rounded-full">
                    <Upload className="h-3.5 w-3.5 ml-1.5" /> העלאת לוגו לסימן המים
                  </Button>
                )}
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files)} />
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <label className="font-medium">גודל</label>
                    <span className="text-muted-foreground tabular-nums" dir="ltr">{watermarkSize}%</span>
                  </div>
                  <Slider value={[watermarkSize]} min={5} max={60} step={1} onValueChange={([v]) => setWatermarkSize(v)} className="mt-1.5" dir="rtl" />
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <label className="font-medium">בהירות (שקיפות)</label>
                    <span className="text-muted-foreground tabular-nums" dir="ltr">{watermarkOpacity}%</span>
                  </div>
                  <Slider value={[watermarkOpacity]} min={5} max={100} step={1} onValueChange={([v]) => setWatermarkOpacity(v)} className="mt-1.5" dir="rtl" />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-sm cursor-pointer w-fit">
                <Checkbox checked={allWatermarked} onCheckedChange={toggleWatermarkAll} />
                הוספת סימן מים על כל התמונות
              </label>
              <p className="text-xs text-muted-foreground">אפשר גם לסמן/לבטל סימן מים לתמונה ספציפית בכרטיסייה שלה למטה.</p>
            </div>
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
                  <div className="flex items-center gap-1 text-[10px]">
                    {item.clientWorkflowId ? (
                      <span className="inline-flex items-center gap-1 text-primary" title={item.clientName ?? undefined}>
                        <Link2 className="h-3 w-3" /> <span className="truncate max-w-[90px]">{item.clientName || "לקוחה"}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">חד-פעמי</span>
                    )}
                  </div>
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
        </>
      )}

      {/* "Existing client or one-off" prompt, shown right before newly picked files are added */}
      <Dialog open={pendingFiles !== null} onOpenChange={(open) => { if (!open) setPendingFiles(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pendingFiles?.length ?? 0} תמונות נבחרו</DialogTitle>
            <DialogDescription>האם זה עבור לקוחת ניו-בורן קיימת (יסתנכרן לגלריה שלה), או שזה חד-פעמי?</DialogDescription>
          </DialogHeader>

          <Button type="button" variant="outline" className="w-full rounded-full" onClick={() => commitPendingFiles(null, null)}>
            חד-פעמי — הורדה בלבד, בלי לקוחה
          </Button>

          <div className="pt-2 border-t border-border space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <UserRound className="h-4 w-4" /> בחירת לקוחה קיימת
            </div>
            <Input
              placeholder="חיפוש לפי שם, טלפון או מייל..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
            <div className="max-h-56 overflow-y-auto space-y-1">
              {clientsQuery.isLoading && <p className="text-sm text-muted-foreground py-2">טוען לקוחות...</p>}
              {!clientsQuery.isLoading && filteredClients.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">לא נמצאו לקוחות תואמות.</p>
              )}
              {filteredClients.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => commitPendingFiles(c.id, c.contact_name)}
                  className="w-full text-right rounded-xl border border-border hover:bg-muted transition-colors p-2.5"
                >
                  <div className="text-sm font-medium">{c.contact_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{c.contact_email || c.contact_phone || ""}</div>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

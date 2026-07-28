import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Images, Loader2, Trash2, Upload, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { builtinPageImages, fetchPageImages, PAGE_IMAGE_KEYS, type PageImage } from "@/lib/page-images";

export const Route = createFileRoute("/_authenticated/admin/gallery")({
  component: AdminGalleryPage,
});

const TABS = [
  { key: PAGE_IMAGE_KEYS.studioRental, label: "השכרת סטודיו" },
  { key: PAGE_IMAGE_KEYS.photographyStudio, label: "צילומים – בסטודיו" },
  { key: PAGE_IMAGE_KEYS.photographyOutdoor, label: "צילומים – בטבע" },
] as const;

async function uploadToStorage(file: File) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `pages/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("items").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage
    .from("items")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה ביצירת קישור לתמונה");
  return { url: data.signedUrl, path };
}

function AdminGalleryPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState<string>(PAGE_IMAGE_KEYS.studioRental);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const images = useQuery({
    queryKey: ["page-images", page],
    queryFn: () => fetchPageImages(page),
  });

  const rows = images.data ?? [];
  const managed = rows.some((r) => r.source === "builtin");
  const builtins = builtinPageImages(page);
  const pendingBuiltins = builtins.filter((url) => !rows.some((r) => r.url === url));
  const refresh = () => qc.invalidateQueries({ queryKey: ["page-images", page] });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setBusy(true);
    setProgress({ done: 0, total: list.length });
    let ok = 0;
    let sort = (rows.length ?? 0) + 1;
    for (const file of list) {
      try {
        const { url, path } = await uploadToStorage(file);
        const { error } = await supabase.from("page_images").insert({
          page,
          url,
          storage_path: path,
          caption: file.name.replace(/\.[^.]+$/, ""),
          sort_order: sort++,
        });
        if (error) throw error;
        ok++;
      } catch (e: any) {
        toast.error(`${file.name}: ${e.message ?? "שגיאה בהעלאה"}`);
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setBusy(false);
    if (ok) toast.success(`הועלו ${ok} תמונות`);
    if (inputRef.current) inputRef.current.value = "";
    refresh();
  };

  /** Bring built-in page photos into the gallery so they can be reordered / removed. */
  const importBuiltins = async () => {
    setBusy(true);
    try {
      // Mark rows that already mirror a built-in photo.
      const existing = rows.filter((r) => builtins.includes(r.url) && r.source !== "builtin");
      for (const r of existing) {
        await supabase.from("page_images").update({ source: "builtin" }).eq("id", r.id);
      }
      let sort = rows.length ? Math.min(...rows.map((r) => r.sort_order)) - pendingBuiltins.length : 0;
      for (const url of pendingBuiltins) {
        const { error } = await supabase
          .from("page_images")
          .insert({ page, url, source: "builtin", sort_order: sort++, caption: "תמונה מובנית" });
        if (error) throw error;
      }
      toast.success("התמונות המובנות נוספו לגלריה וניתן לסדר או למחוק אותן");
    } catch (e: any) {
      toast.error(e.message ?? "שגיאה בייבוא התמונות");
    }
    setBusy(false);
    refresh();
  };

  const remove = async (img: PageImage) => {
    if (!confirm("למחוק את התמונה?")) return;
    const { error } = await supabase.from("page_images").delete().eq("id", img.id);
    if (error) return toast.error(error.message);
    if (img.storage_path) await supabase.storage.from("items").remove([img.storage_path]);
    toast.success("התמונה נמחקה");
    refresh();
  };

  /** Move an image one position earlier/later by swapping sort_order values. */
  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const a = rows[index];
    const b = rows[target];
    setBusy(true);
    const { error: e1 } = await supabase.from("page_images").update({ sort_order: b.sort_order }).eq("id", a.id);
    const { error: e2 } = await supabase.from("page_images").update({ sort_order: a.sort_order }).eq("id", b.id);
    setBusy(false);
    if (e1 || e2) return toast.error((e1 ?? e2)!.message);
    refresh();
  };

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-primary flex items-center gap-2">
            <Images className="h-5 w-5" /> גלריות באתר
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            העלאה, מחיקה ושינוי סדר של תמונות בדף השכרת הסטודיו ובדפי הצילומים. אפשר להעלות כמה תמונות בבת אחת.
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 h-11 text-sm disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy ? `מעלה ${progress.done}/${progress.total}...` : "העלאת תמונות"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setPage(t.key)}
            className={`px-4 h-10 rounded-full text-sm transition-colors border ${
              page === t.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-primary/10 hover:bg-cream"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!managed && builtins.length > 0 && (
        <div className="rounded-2xl border border-primary/15 bg-cream/60 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            בעמוד זה מוצגות {builtins.length} תמונות מובנות. כדי למחוק אותן או לשנות את סדרן – יש להוסיף אותן לגלריה.
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={importBuiltins}
            className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-4 h-10 text-sm disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            הוספת התמונות המובנות לגלריה
          </button>
        </div>
      )}

      {!managed && builtins.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {builtins.map((url) => (
            <div key={url} className="relative aspect-square overflow-hidden rounded-2xl border border-primary/10 bg-cream">
              <img src={url} alt="תמונה מובנית" loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute bottom-2 right-2 rounded-full bg-black/60 text-white text-[11px] px-2 py-0.5">
                מובנית
              </span>
            </div>
          ))}
        </div>
      )}

      {images.isLoading ? (
        <div className="text-sm text-muted-foreground">טוען...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-primary/20 p-10 text-center text-sm text-muted-foreground">
          אין עדיין תמונות שהועלו לגלריה הזו. לחצי על "העלאת תמונות".
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {rows.map((img, i) => (
            <div key={img.id} className="group relative aspect-square overflow-hidden rounded-2xl border border-primary/10 bg-cream">
              <img src={img.url} alt={img.caption ?? "תמונה"} loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute top-2 right-2 rounded-full bg-black/50 text-white text-[11px] px-2 py-0.5">
                {i + 1}
                {img.source === "builtin" ? " · מובנית" : ""}
              </span>
              <button
                type="button"
                onClick={() => remove(img)}
                className="absolute top-2 left-2 h-9 w-9 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                aria-label="מחיקת תמונה"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <div className="absolute bottom-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <button
                  type="button"
                  disabled={busy || i === 0}
                  onClick={() => move(i, -1)}
                  className="h-9 w-9 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30"
                  aria-label="הזזה אחורה"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={busy || i === rows.length - 1}
                  onClick={() => move(i, 1)}
                  className="h-9 w-9 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30"
                  aria-label="הזזה קדימה"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

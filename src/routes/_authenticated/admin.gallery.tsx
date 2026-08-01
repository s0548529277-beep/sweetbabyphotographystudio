import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Images, Loader2, Trash2, Upload, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { builtinEntries, fetchPageImages, PAGE_IMAGE_KEYS, resolveAspect, rowUrl, saveAspect, type PageImage } from "@/lib/page-images";

export const Route = createFileRoute("/_authenticated/admin/gallery")({
  component: AdminGalleryPage,
});

const TABS = [
  { key: PAGE_IMAGE_KEYS.studioRental, label: "השכרת סטודיו" },
  { key: PAGE_IMAGE_KEYS.photographyStudio, label: "צילומים – בסטודיו" },
  { key: PAGE_IMAGE_KEYS.photographyOutdoor, label: "צילומים – בטבע" },
  { key: PAGE_IMAGE_KEYS.homeHero, label: "דף הבית – תמונות מתחלפות" },
  { key: PAGE_IMAGE_KEYS.rentalInspiration, label: "השכרת אביזרים – תמונות מתחלפות" },
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
  const refresh = () => qc.invalidateQueries({ queryKey: ["page-images", page] });

  // Bundled site photos are adopted into the gallery automatically, so every
  // image on every page can be deleted / reordered from here.
  useEffect(() => {
    if (!images.data) return;
    const adopted = new Set(images.data.filter((r) => r.source === "builtin").map((r) => r.storage_path ?? ""));
    const pending = builtinEntries(page).filter((e) => !adopted.has(e.key));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      let sort = images.data!.length ? Math.min(...images.data!.map((r) => r.sort_order)) - pending.length : 0;
      const payload = pending.map((e) => ({
        page,
        url: e.url,
        storage_path: e.key,
        source: "builtin",
        caption: null,
        sort_order: sort++,
      }));
      const { error } = await supabase.from("page_images").insert(payload);
      if (!cancelled && !error) refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [images.data, page]);

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

  const remove = async (img: PageImage) => {
    if (!confirm("למחוק את התמונה מהעמוד?")) return;
    if (img.source === "builtin") {
      // Bundled asset — keep the record so it isn't re-adopted, just hide it.
      const { error } = await supabase.from("page_images").update({ hidden: true }).eq("id", img.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("page_images").delete().eq("id", img.id);
      if (error) return toast.error(error.message);
      if (img.storage_path) await supabase.storage.from("items").remove([img.storage_path]);
    }
    toast.success("התמונה הוסרה מהעמוד");
    refresh();
  };

  const restore = async (img: PageImage) => {
    const { error } = await supabase.from("page_images").update({ hidden: false }).eq("id", img.id);
    if (error) return toast.error(error.message);
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
            כל התמונות בעמודים – כולל אלה שהיו מוטמעות באתר – ניתנות למחיקה ולשינוי סדר מכאן. אפשר להעלות כמה תמונות בבת אחת.
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

      {(page === PAGE_IMAGE_KEYS.homeHero || page === PAGE_IMAGE_KEYS.rentalInspiration) && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/10 bg-card p-3">
          <span className="text-sm text-muted-foreground">פורמט התמונות באתר:</span>
          {([
            { key: "portrait", label: "לגובה (4:5)" },
            { key: "landscape", label: "לרוחב (16:9)" },
          ] as const).map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={async () => {
                try {
                  await saveAspect(page, o.key);
                  refresh();
                  toast.success("הפורמט עודכן");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "שגיאה בעדכון");
                }
              }}
              className={`px-4 h-9 rounded-full text-sm border ${
                aspect === o.key ? "bg-primary text-primary-foreground border-primary" : "border-primary/15 hover:bg-cream"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {images.isLoading ? (
        <div className="text-sm text-muted-foreground">טוען...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-primary/20 p-10 text-center text-sm text-muted-foreground">
          אין עדיין תמונות בגלריה הזו. לחצי על "העלאת תמונות".
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {rows.map((img, i) => (
            <div
              key={img.id}
              className={`group relative aspect-square overflow-hidden rounded-2xl border border-primary/10 bg-cream ${
                img.hidden ? "opacity-40" : ""
              }`}
            >
              <img src={rowUrl(page, img)} alt={img.caption ?? "תמונה"} loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute top-2 right-2 rounded-full bg-black/50 text-white text-[11px] px-2 py-0.5">
                {i + 1}
                {img.hidden ? " · מוסתרת" : ""}
              </span>
              {img.hidden ? (
                <button
                  type="button"
                  onClick={() => restore(img)}
                  className="absolute top-2 left-2 h-9 w-9 rounded-full bg-black/60 text-white flex items-center justify-center"
                  aria-label="החזרת תמונה לעמוד"
                >
                  <Eye className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => remove(img)}
                  className="absolute top-2 left-2 h-9 w-9 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  aria-label="מחיקת תמונה"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
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

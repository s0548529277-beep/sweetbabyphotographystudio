import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2, Search, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchItemInspiration } from "@/lib/item-inspiration";
import { inspirationFor } from "@/lib/inspiration";
import catalog from "@/data/studio-catalog.json";
import michalPhotos from "@/data/michal-photos.json";

export const Route = createFileRoute("/_authenticated/admin/inspiration")({
  component: AdminInspirationPage,
});

type CatalogItem = { sku: string; name?: string; img?: string; hasHand?: boolean };

const ITEMS: CatalogItem[] = (
  Array.isArray(catalog)
    ? (catalog as any[])
    : ((catalog as any).categories ?? []).flatMap((c: any) => c.items ?? [])
) as CatalogItem[];

const POOL = michalPhotos as { url: string; title: string }[];

async function uploadToStorage(file: File) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `inspiration/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("items").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage
    .from("items")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה ביצירת קישור לתמונה");
  return { url: data.signedUrl, path };
}

function AdminInspirationPage() {
  const qc = useQueryClient();
  const [sku, setSku] = useState<string>(ITEMS[0]?.sku ?? "");
  const [itemSearch, setItemSearch] = useState("");
  const [poolSearch, setPoolSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const rows = useQuery({ queryKey: ["item-inspiration-admin"], queryFn: fetchItemInspiration });
  const forSku = (rows.data ?? []).filter((r) => r.sku === sku);
  const countBySku = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows.data ?? []) m[r.sku] = (m[r.sku] ?? 0) + 1;
    return m;
  }, [rows.data]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const list = ITEMS.filter((i) => !i.hasHand);
    if (!q) return list.slice(0, 200);
    return list
      .filter((i) => i.sku.toLowerCase().includes(q) || (i.name ?? "").toLowerCase().includes(q))
      .slice(0, 200);
  }, [itemSearch]);

  const filteredPool = useMemo(() => {
    const q = poolSearch.trim().toLowerCase();
    const list = q ? POOL.filter((p) => p.title.toLowerCase().includes(q) || p.url.toLowerCase().includes(q)) : POOL;
    return list.slice(0, 120);
  }, [poolSearch]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["item-inspiration-admin"] });
    qc.invalidateQueries({ queryKey: ["item-inspiration"] });
  };

  const addUrl = async (url: string, caption: string, source: string, storagePath?: string) => {
    if (!sku) return toast.error("בחרי מק״ט קודם");
    const { error } = await supabase.from("item_inspiration_images").insert({
      sku,
      url,
      caption,
      source,
      storage_path: storagePath ?? null,
      sort_order: forSku.length + 1,
    });
    if (error) return toast.error(error.message);
    toast.success(`נוספה תמונה למק״ט ${sku}`);
    refresh();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        const { url, path } = await uploadToStorage(file);
        await addUrl(url, file.name.replace(/\.[^.]+$/, ""), "upload", path);
        ok++;
      } catch (e: any) {
        toast.error(`${file.name}: ${e.message ?? "שגיאה בהעלאה"}`);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (ok) refresh();
  };

  const remove = async (id: string, storagePath: string | null) => {
    if (!confirm("להסיר את התמונה מהמק״ט?")) return;
    const { error } = await supabase.from("item_inspiration_images").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (storagePath) await supabase.storage.from("items").remove([storagePath]);
    toast.success("הוסר");
    refresh();
  };

  const selectedItem = ITEMS.find((i) => i.sku === sku);
  const localImages = inspirationFor(sku);

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-primary flex items-center gap-2">
          <Camera className="h-5 w-5" /> תמונות השראה לפי מק״ט
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          כל תמונה שתשייכי למק״ט תופיע בדף השכרת האביזרים מתחת לאביזר — ובמעבר עכבר או לחיצה על התמונה
          הראשית רואים את התמונה שצולמה עם האביזר.
        </p>
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        {/* item picker */}
        <aside className="rounded-3xl border border-primary/10 bg-card p-4">
          <div className="relative mb-3">
            <Search className="h-4 w-4 absolute top-3 right-3 text-muted-foreground" />
            <input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="חיפוש מק״ט או שם"
              className="w-full h-10 rounded-full border border-primary/15 bg-background pr-9 pl-3 text-sm"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-1">
            {filteredItems.map((it) => (
              <button
                key={it.sku}
                onClick={() => setSku(it.sku)}
                className={
                  "w-full text-right rounded-xl px-3 py-2 text-sm flex items-center justify-between gap-2 " +
                  (sku === it.sku ? "bg-primary text-primary-foreground" : "hover:bg-muted")
                }
              >
                <span className="truncate">
                  {it.sku} · {it.name ?? ""}
                </span>
                {(countBySku[it.sku] ?? 0) > 0 && (
                  <span className="text-[10px] rounded-full bg-background/30 px-2 py-0.5">
                    {countBySku[it.sku]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        <div className="space-y-6">
          {/* current */}
          <section className="rounded-3xl border border-primary/10 bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                {selectedItem?.img && (
                  <img src={selectedItem.img} alt="" className="h-14 w-14 rounded-xl object-cover" />
                )}
                <div>
                  <div className="font-display text-lg text-primary">מק״ט {sku}</div>
                  <div className="text-xs text-muted-foreground">{selectedItem?.name}</div>
                </div>
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
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 h-10 text-sm disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  העלאת תמונות
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {localImages.map((url) => (
                <div key={url} className="relative rounded-xl overflow-hidden border border-primary/10">
                  <img src={url} alt="" className="h-24 w-full object-cover" />
                  <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
                    קובץ באתר
                  </span>
                </div>
              ))}
              {forSku.map((r) => (
                <div key={r.id} className="relative rounded-xl overflow-hidden border border-primary/10 group">
                  <img src={r.url} alt="" className="h-24 w-full object-cover" />
                  <button
                    onClick={() => remove(r.id, r.storage_path)}
                    className="absolute top-1 left-1 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    aria-label="מחיקה"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {localImages.length === 0 && forSku.length === 0 && (
                <div className="col-span-full text-sm text-muted-foreground py-6 text-center">
                  אין עדיין תמונות השראה למק״ט הזה.
                </div>
              )}
            </div>
          </section>

          {/* pool from michalsiboni.co.il */}
          <section className="rounded-3xl border border-primary/10 bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="font-display text-lg text-primary">תמונות מהאתר michalsiboni.co.il</h3>
                <p className="text-xs text-muted-foreground">
                  {POOL.length} תמונות נטענו אוטומטית מהאתר. לחיצה על תמונה משייכת אותה למק״ט שנבחר.
                </p>
              </div>
              <div className="relative">
                <Search className="h-4 w-4 absolute top-3 right-3 text-muted-foreground" />
                <input
                  value={poolSearch}
                  onChange={(e) => setPoolSearch(e.target.value)}
                  placeholder="חיפוש בשם הקובץ"
                  className="h-10 w-56 rounded-full border border-primary/15 bg-background pr-9 pl-3 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 max-h-[55vh] overflow-y-auto">
              {filteredPool.map((p) => (
                <button
                  key={p.url}
                  onClick={() => addUrl(p.url, p.title, "michalsiboni")}
                  className="relative rounded-lg overflow-hidden border border-primary/10 hover:border-primary transition"
                  title={p.title}
                >
                  <img src={p.url} alt={p.title} loading="lazy" className="h-24 w-full object-cover" />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

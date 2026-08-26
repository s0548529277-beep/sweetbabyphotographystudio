import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ImageIcon, Upload, Download, FolderPlus, GripVertical, Sparkles } from "lucide-react";
import { toCSV, downloadCSV, parseCSVRecords } from "@/lib/csv";
import { fetchItemInspiration, type ItemInspirationImage } from "@/lib/item-inspiration";

export const Route = createFileRoute("/_authenticated/admin/items")({
  component: ItemsAdmin,
});

type ItemForm = {
  id?: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  category_id: string | null;
  active: boolean;
  stock_quantity: number;
};

const empty: ItemForm = { sku: "", name: "", description: "", price: 0, image_url: null, category_id: null, active: true, stock_quantity: 1 };

function pad(n: number, width = 3) {
  return String(n).padStart(width, "0");
}

function categoryPrefix(cat: { slug?: string | null; name: string } | undefined) {
  if (!cat) return "SKU";
  const base = (cat.slug || cat.name || "SKU").toString().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return base || "SKU";
}

function nextSkuFor(prefix: string, existing: string[]) {
  const re = new RegExp(`^${prefix}-(\\d+)$`, "i");
  let max = 0;
  for (const s of existing) {
    const m = s.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${pad(max + 1)}`;
}

function ItemsAdmin() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ItemForm>(empty);
  const [uploading, setUploading] = useState(false);
  const [rowUploading, setRowUploading] = useState<string | null>(null);
  const [rowUploadingInspiration, setRowUploadingInspiration] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState("");

  // Bulk upload dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCat, setBulkCat] = useState<string | null>(null);
  const [bulkPrice, setBulkPrice] = useState<number>(0);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  // New category dialog
  const [catOpen, setCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatSlug, setNewCatSlug] = useState("");

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("*").order("sort_order")).data ?? [],
  });

  const items = useQuery({
    queryKey: ["admin-items"],
    queryFn: async () => {
      const { data } = await supabase
        .from("items")
        .select("*, categories(name, slug)")
        .order("sort_order", { ascending: true })
        .order("sku", { ascending: true });
      return data ?? [];
    },
  });

  // First inspiration photo per SKU, for the quick inline thumbnail — the
  // full gallery (multiple photos per SKU) is still managed on
  // /admin/inspiration, this is just a fast add/replace shortcut.
  const inspirationRows = useQuery({ queryKey: ["item-inspiration"], queryFn: fetchItemInspiration });
  const inspirationBySku = useMemo(() => {
    const map: Record<string, ItemInspirationImage> = {};
    for (const r of inspirationRows.data ?? []) if (!map[r.sku]) map[r.sku] = r;
    return map;
  }, [inspirationRows.data]);

  // Drag & drop ordering — the same order is used by the public catalog.
  const [dragSku, setDragSku] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const persistOrder = async (ordered: any[]) => {
    setSavingOrder(true);
    try {
      await Promise.all(
        ordered.map((row, idx) =>
          supabase.from("items").update({ sort_order: (idx + 1) * 10 }).eq("id", row.id),
        ),
      );
      await qc.invalidateQueries({ queryKey: ["admin-items"] });
      await qc.invalidateQueries({ queryKey: ["items"] });
      toast.success("הסדר נשמר ועודכן גם בקטלוג");
    } catch {
      toast.error("שמירת הסדר נכשלה");
    } finally {
      setSavingOrder(false);
    }
  };

  const dropOn = async (targetId: string) => {
    const all = [...(items.data ?? [])] as any[];
    const fromIdx = all.findIndex((r) => r.id === dragSku);
    const toIdx = all.findIndex((r) => r.id === targetId);
    setDragSku(null);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const [moved] = all.splice(fromIdx, 1);
    all.splice(toIdx, 0, moved);
    qc.setQueryData(["admin-items"], all);
    await persistOrder(all);
  };


  const skusByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const i of items.data ?? []) {
      const key = (i as any).category_id ?? "__none__";
      const arr = map.get(key) ?? [];
      arr.push((i as any).sku);
      map.set(key, arr);
    }
    return map;
  }, [items.data]);

  // Auto-suggest SKU when creating a new item and category changes
  useEffect(() => {
    if (form.id) return; // editing
    if (!form.category_id) return;
    const cat = categories.data?.find((c) => c.id === form.category_id);
    if (!cat) return;
    const prefix = categoryPrefix(cat);
    const existing = skusByCategory.get(form.category_id) ?? [];
    // Only overwrite if empty or matches auto-pattern
    if (!form.sku || new RegExp(`^${prefix}-\\d+$`, "i").test(form.sku)) {
      setForm((f) => ({ ...f, sku: nextSkuFor(prefix, existing) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.category_id, categories.data, skusByCategory]);

  const editItem = (i: any) => {
    setForm({
      id: i.id, sku: i.sku, name: i.name, description: i.description ?? "",
      price: Number(i.price), image_url: i.image_url, category_id: i.category_id, active: i.active,
      stock_quantity: Number(i.stock_quantity ?? 1),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.sku) return toast.error("שם ומק״ט חובה");
    const payload = {
      sku: form.sku, name: form.name, description: form.description || null,
      price: form.price, image_url: form.image_url, category_id: form.category_id, active: form.active,
      stock_quantity: Math.max(1, Math.floor(form.stock_quantity || 1)),
    };
    const { error } = form.id
      ? await supabase.from("items").update(payload).eq("id", form.id)
      : await supabase.from("items").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("נשמר");
    setOpen(false); setForm(empty);
    qc.invalidateQueries({ queryKey: ["admin-items"] });
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  // Inline, spreadsheet-style edits straight from the table cells — no
  // dialog needed for the fields people change most often.
  const updateItemField = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("items").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["admin-items"] });
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  const del = async (id: string) => {
    if (!confirm("למחוק?")) return;
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { qc.invalidateQueries({ queryKey: ["admin-items"] }); qc.invalidateQueries({ queryKey: ["items"] }); }
  };

  // Uploads to the private "items" bucket and returns a long-lived signed URL.
  const uploadToStorage = async (file: File, prefix = "") => {
    const compressed = await compressImage(file);
    const ext = compressed.name.split(".").pop();
    const path = `${prefix}${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("items").upload(path, compressed, { upsert: false });
    if (error) throw error;
    const { data, error: signErr } = await supabase.storage
      .from("items")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (signErr || !data?.signedUrl) throw signErr ?? new Error("שגיאה ביצירת קישור לתמונה");
    return { url: data.signedUrl, path };
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await uploadToStorage(file);
      setForm((f) => ({ ...f, image_url: url }));
    } catch (e: any) {
      toast.error(e.message ?? "שגיאה בהעלאה");
    }
    setUploading(false);
  };

  // Quick per-row image upload straight from the table
  const uploadRowImage = async (itemId: string, file: File) => {
    setRowUploading(itemId);
    try {
      const { url } = await uploadToStorage(file);
      const { error } = await supabase.from("items").update({ image_url: url }).eq("id", itemId);
      if (error) throw error;
      toast.success("התמונה עודכנה");
      qc.invalidateQueries({ queryKey: ["admin-items"] });
      qc.invalidateQueries({ queryKey: ["items"] });
    } catch (e: any) {
      toast.error(e.message ?? "שגיאה בהעלאה");
    }
    setRowUploading(null);
  };

  // Quick per-row inspiration-photo add/replace, straight from the table —
  // the full multi-photo gallery per SKU still lives on /admin/inspiration,
  // this always keeps just the one most-recent photo (replaces, doesn't
  // pile up), so it behaves like the product-photo upload right next to it.
  const uploadRowInspiration = async (sku: string, file: File) => {
    setRowUploadingInspiration(sku);
    try {
      const { url, path } = await uploadToStorage(file, "inspiration/");
      const existing = (inspirationRows.data ?? []).filter((r) => r.sku === sku);
      const { error } = await supabase.from("item_inspiration_images").insert({
        sku,
        url,
        storage_path: path,
        caption: file.name.replace(/\.[^.]+$/, ""),
        source: "upload",
        sort_order: 1,
      });
      if (error) throw error;
      // Replace, not accumulate — remove whatever was there before.
      for (const old of existing) {
        await supabase.from("item_inspiration_images").delete().eq("id", old.id);
        if (old.storage_path) await supabase.storage.from("items").remove([old.storage_path]);
      }
      toast.success("תמונת ההשראה עודכנה");
      qc.invalidateQueries({ queryKey: ["item-inspiration"] });
      qc.invalidateQueries({ queryKey: ["item-inspiration-admin"] });
    } catch (e: any) {
      toast.error(e.message ?? "שגיאה בהעלאה");
    }
    setRowUploadingInspiration(null);
  };


  const createCategory = async () => {
    const name = newCatName.trim();
    if (!name) return toast.error("שם קטגוריה חובה");
    const slug = (newCatSlug.trim() || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data, error } = await supabase.from("categories").insert({ name, slug, sort_order: (categories.data?.length ?? 0) + 1 }).select().single();
    if (error) return toast.error(error.message);
    toast.success("קטגוריה נוצרה");
    setNewCatName(""); setNewCatSlug("");
    await qc.invalidateQueries({ queryKey: ["categories"] });
    setForm((f) => ({ ...f, category_id: data.id }));
    setBulkCat(data.id);
  };

  // Deleting a category is safe for items: items.category_id has
  // ON DELETE SET NULL, so affected items just fall back to "ללא קטגוריה"
  // instead of being deleted or blocked.
  const deleteCategory = async (cat: { id: string; name: string }) => {
    const affected = (items.data ?? []).filter((i: any) => i.category_id === cat.id).length;
    const msg = affected > 0
      ? `למחוק את הקטגוריה "${cat.name}"? ${affected} פריטים ישויכו ל"ללא קטגוריה".`
      : `למחוק את הקטגוריה "${cat.name}"?`;
    if (!confirm(msg)) return;
    const { error } = await supabase.from("categories").delete().eq("id", cat.id);
    if (error) return toast.error(error.message);
    toast.success("הקטגוריה נמחקה");
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["admin-items"] });
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  const runBulkUpload = async () => {
    if (!bulkCat) return toast.error("בחרי קטגוריה");
    if (bulkFiles.length === 0) return toast.error("בחרי לפחות תמונה אחת");
    setBulkBusy(true);
    const cat = categories.data?.find((c) => c.id === bulkCat);
    const prefix = categoryPrefix(cat);
    const existing = [...(skusByCategory.get(bulkCat) ?? [])];
    let ok = 0;
    for (const file of bulkFiles) {
      try {
        const { url } = await uploadToStorage(file);
        const sku = nextSkuFor(prefix, existing);
        existing.push(sku);
        const name = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || sku;
        const { error } = await supabase.from("items").insert({
          sku, name, price: bulkPrice, image_url: url, category_id: bulkCat, active: true,
        });
        if (error) throw error;
        ok++;
      } catch (e: any) {
        toast.error(`${file.name}: ${e.message ?? "שגיאה"}`);
      }
    }
    setBulkBusy(false);
    toast.success(`הועלו ${ok} פריטים`);
    setBulkFiles([]); setBulkOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-items"] });
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  const exportCsv = () => {
    const rows = (items.data ?? []).map((i: any) => ({
      sku: i.sku,
      category: i.categories?.name ?? "",
      name: i.name,
      price: Number(i.price).toFixed(2),
      image_url: i.image_url ?? "",
      stock_quantity: Number(i.stock_quantity ?? 1),
      sort_order: Number(i.sort_order ?? 0),
    }));
    const csv = toCSV(rows, [
      { key: "sku", label: "מק״ט" },
      { key: "category", label: "קטגוריה" },
      { key: "name", label: "שם" },
      { key: "price", label: "מחיר" },
      { key: "image_url", label: "קישור לתמונה" },
      { key: "stock_quantity", label: "כמות במלאי" },
      { key: "sort_order", label: "סדר תצוגה" },
    ]);
    downloadCSV(`catalog-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  // Same columns as exportCsv (מק״ט, קטגוריה, שם, מחיר, קישור לתמונה, כמות
  // במלאי, סדר תצוגה) — download, edit in Excel/Sheets, re-upload here.
  // Matches by SKU: an existing SKU is updated in place, a new one is
  // created. A category name that doesn't exist yet is created on the
  // fly. If the quantity/order cells are left blank (e.g. an older
  // export without those columns), the item's current value is kept
  // instead of being reset. Doesn't touch "active".
  const importCsv = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const records = parseCSVRecords(text);
      if (records.length === 0) {
        toast.error("הקובץ ריק או שלא זוהו שורות");
        return;
      }

      const catByName = new Map<string, string>();
      for (const c of categories.data ?? []) catByName.set(c.name, c.id);

      let created = 0, updated = 0, catsCreated = 0, failed = 0;
      for (const r of records) {
        const sku = (r["מק״ט"] || r["מקט"] || "").trim();
        const catName = (r["קטגוריה"] || "").trim();
        const name = (r["שם"] || "").trim();
        const price = Number((r["מחיר"] || "0").trim()) || 0;
        const image_url = (r["קישור לתמונה"] || "").trim() || null;
        const stockRaw = (r["כמות במלאי"] || "").trim();
        const sortRaw = (r["סדר תצוגה"] || "").trim();
        if (!sku || !name) { failed++; continue; }

        let category_id: string | null = null;
        if (catName) {
          category_id = catByName.get(catName) ?? null;
          if (!category_id) {
            const { data, error } = await supabase
              .from("categories")
              .insert({ name: catName, slug: catName })
              .select("id")
              .single();
            if (!error && data) {
              category_id = data.id;
              catByName.set(catName, data.id);
              catsCreated++;
            }
          }
        }

        const { data: existing } = await supabase
          .from("items")
          .select("id, stock_quantity, sort_order")
          .eq("sku", sku)
          .maybeSingle();

        const stock_quantity =
          stockRaw !== "" ? Math.max(1, Math.floor(Number(stockRaw)) || 1) : Number(existing?.stock_quantity ?? 1);
        const sort_order = sortRaw !== "" ? Math.floor(Number(sortRaw)) || 0 : Number(existing?.sort_order ?? 0);

        if (existing) {
          const { error } = await supabase
            .from("items")
            .update({ name, price, image_url, category_id, stock_quantity, sort_order })
            .eq("id", existing.id);
          if (error) failed++; else updated++;
        } else {
          const { error } = await supabase
            .from("items")
            .insert({ sku, name, price, image_url, category_id, active: true, stock_quantity, sort_order });
          if (error) failed++; else created++;
        }
      }

      toast.success(
        `עודכנו ${updated}, נוספו ${created}` +
          (catsCreated ? `, ${catsCreated} קטגוריות חדשות` : "") +
          (failed ? `, ${failed} שורות נכשלו` : ""),
      );
      qc.invalidateQueries({ queryKey: ["admin-items"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
    } catch (e: any) {
      toast.error(e.message ?? "ייבוא נכשל");
    } finally {
      setImporting(false);
    }
  };

  const filtered = (items.data ?? []).filter((i: any) =>
    !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.sku.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input placeholder="חיפוש שם או מק״ט…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm rounded-full" />
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="rounded-full gap-2" onClick={exportCsv}>
            <Download className="h-4 w-4" /> ייצוא CSV
          </Button>
          <label className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-input px-4 h-9 text-sm hover:bg-accent">
            <Upload className="h-4 w-4" /> {importing ? "מייבא…" : "ייבוא CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCsv(f);
                e.target.value = "";
              }}
            />
          </label>
          <Button variant="outline" className="rounded-full gap-2" onClick={() => setBulkOpen(true)}>
            <Upload className="h-4 w-4" /> העלאה מרובה
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setForm(empty); setOpen(true); }} className="rounded-full gap-2"><Plus className="h-4 w-4" /> אביזר חדש</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg" dir="rtl">
              <DialogHeader><DialogTitle className="font-display text-2xl">{form.id ? "עריכת אביזר" : "אביזר חדש"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>מק״ט</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="mt-1" /></div>
                  <div><Label>מחיר (₪)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} className="mt-1" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>שם</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
                  <div>
                    <Label>כמות במלאי</Label>
                    <Input
                      type="number" min={1}
                      value={form.stock_quantity}
                      onChange={(e) => setForm({ ...form, stock_quantity: Math.max(1, Number(e.target.value) || 1) })}
                      className="mt-1"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">מספר יחידות זמינות. לרוב 1. לכובעים/פריטים כפולים — 2 ומעלה.</p>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label>קטגוריה</Label>
                    <button type="button" onClick={() => setCatOpen(true)} className="text-xs text-forest hover:underline inline-flex items-center gap-1">
                      <FolderPlus className="h-3 w-3" /> קטגוריה חדשה
                    </button>
                  </div>
                  <Select value={form.category_id ?? "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? null : v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— ללא —</SelectItem>
                      {categories.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>תיאור</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" /></div>
                <div>
                  <Label>תמונה</Label>
                  <div className="mt-1 flex gap-3 items-center">
                    <div className="h-20 w-20 rounded-xl bg-cream overflow-hidden flex items-center justify-center">
                      {form.image_url ? <img src={form.image_url} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="h-6 w-6 text-primary/30" />}
                    </div>
                    <label className="cursor-pointer inline-flex items-center gap-2 px-4 h-10 rounded-full border border-primary/20 hover:bg-cream text-sm">
                      <Upload className="h-3 w-3" />
                      {uploading ? "מעלה…" : "העלה תמונה"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                  <Label>מוצג בקטלוג</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button>
                <Button onClick={save}>שמור</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Bulk upload dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle className="font-display text-2xl">העלאה מרובה</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <Label>קטגוריה</Label>
                <button type="button" onClick={() => setCatOpen(true)} className="text-xs text-forest hover:underline inline-flex items-center gap-1">
                  <FolderPlus className="h-3 w-3" /> קטגוריה חדשה
                </button>
              </div>
              <Select value={bulkCat ?? ""} onValueChange={(v) => setBulkCat(v || null)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="בחרי קטגוריה" /></SelectTrigger>
                <SelectContent>
                  {categories.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {bulkCat && (
                <p className="text-xs text-muted-foreground mt-1">
                  המק״טים ימשיכו מ־{nextSkuFor(categoryPrefix(categories.data?.find((c) => c.id === bulkCat)), skusByCategory.get(bulkCat) ?? [])}
                </p>
              )}
            </div>
            <div>
              <Label>מחיר בסיס לכל פריט (₪)</Label>
              <Input type="number" value={bulkPrice} onChange={(e) => setBulkPrice(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label>תמונות</Label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setBulkFiles(Array.from(e.target.files ?? []))}
                className="mt-1 block w-full text-sm"
              />
              {bulkFiles.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{bulkFiles.length} קבצים נבחרו</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>ביטול</Button>
            <Button onClick={runBulkUpload} disabled={bulkBusy}>{bulkBusy ? "מעלה…" : "העלה"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage categories dialog: existing list (with delete) + add new */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="font-display text-2xl">ניהול קטגוריות</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {(categories.data?.length ?? 0) > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {categories.data?.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-cream">
                    <span className="text-sm">{c.name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteCategory(c)}
                      aria-label={`מחיקת קטגוריית ${c.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-3 border-t border-primary/10 pt-4">
              <div><Label>שם קטגוריה חדשה</Label><Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="mt-1" placeholder="לדוגמה: Vintage" /></div>
              <div><Label>קוד (slug)</Label><Input value={newCatSlug} onChange={(e) => setNewCatSlug(e.target.value)} className="mt-1" placeholder="vintage" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCatOpen(false)}>סגירה</Button>
            <Button onClick={createCategory}>הוסף קטגוריה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="bg-card rounded-2xl border border-primary/5 overflow-hidden">
        <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border">
          לחצו על שם, קטגוריה, מחיר, כמות או מצב בטבלה כדי לערוך ישירות — נשמר אוטומטית. גררו שורות כדי לשנות את הסדר — הסדר מתעדכן אוטומטית בקטלוג ובכל דפי האביזרים.
          {savingOrder ? " · שומר…" : ""}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-cream/60 text-right">
            <tr>
              <th className="p-3 font-medium w-8" />
              <th className="p-3 font-medium">תמונה</th>
              <th className="p-3 font-medium">השראה</th>
              <th className="p-3 font-medium">מק״ט</th>
              <th className="p-3 font-medium">שם</th>
              <th className="p-3 font-medium">קטגוריה</th>
              <th className="p-3 font-medium">מחיר</th>
              <th className="p-3 font-medium">כמות</th>
              <th className="p-3 font-medium">מצב</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((i: any) => (
              <tr
                key={i.id}
                draggable
                onDragStart={() => setDragSku(i.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOn(i.id)}
                className={`border-t border-border ${dragSku === i.id ? "opacity-50" : ""}`}
              >
                <td className="p-3 text-muted-foreground cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-4 w-4" />
                </td>

                <td className="p-3">
                  <div className="flex flex-col items-center gap-1 w-16">
                    <div className="h-12 w-12 rounded-lg bg-cream overflow-hidden flex items-center justify-center">
                      {i.image_url
                        ? <img src={i.image_url} alt={i.name} className="w-full h-full object-cover" />
                        : <ImageIcon className="h-4 w-4 text-primary/30" />}
                    </div>
                    <label className="cursor-pointer text-[10px] text-forest hover:underline inline-flex items-center gap-1">
                      <Upload className="h-3 w-3" />
                      {rowUploading === i.id ? "מעלה…" : i.image_url ? "החלפה" : "העלאה"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && uploadRowImage(i.id, e.target.files[0])}
                      />
                    </label>
                  </div>
                </td>

                <td className="p-3">
                  <div className="flex flex-col items-center gap-1 w-16">
                    <div className="h-12 w-12 rounded-lg bg-cream overflow-hidden flex items-center justify-center">
                      {inspirationBySku[i.sku]
                        ? <img src={inspirationBySku[i.sku].url} alt="" className="w-full h-full object-cover" />
                        : <Sparkles className="h-4 w-4 text-primary/30" />}
                    </div>
                    <label className="cursor-pointer text-[10px] text-forest hover:underline inline-flex items-center gap-1">
                      <Upload className="h-3 w-3" />
                      {rowUploadingInspiration === i.sku ? "מעלה…" : inspirationBySku[i.sku] ? "החלפה" : "הוספה"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && uploadRowInspiration(i.sku, e.target.files[0])}
                      />
                    </label>
                  </div>
                </td>

                <td className="p-3 tracking-wider text-xs">{i.sku}</td>

                <td className="p-3">
                  <Input
                    key={`name-${i.id}-${i.name}`}
                    defaultValue={i.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== i.name) updateItemField(i.id, { name: v });
                    }}
                    className="h-8 min-w-[8rem] border-transparent bg-transparent hover:border-input focus:border-input"
                  />
                </td>

                <td className="p-3">
                  <Select
                    value={i.category_id ?? "none"}
                    onValueChange={(v) => updateItemField(i.id, { category_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger className="h-8 w-36 border-transparent bg-transparent hover:border-input">
                      <SelectValue placeholder="בחר קטגוריה" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— ללא —</SelectItem>
                      {categories.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>

                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground text-xs">₪</span>
                    <Input
                      key={`price-${i.id}-${i.price}`}
                      type="number"
                      defaultValue={Number(i.price)}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isNaN(v) && v !== Number(i.price)) updateItemField(i.id, { price: v });
                      }}
                      className="h-8 w-20 border-transparent bg-transparent hover:border-input focus:border-input"
                    />
                  </div>
                </td>

                <td className="p-3">
                  <Input
                    key={`stock-${i.id}-${i.stock_quantity}`}
                    type="number"
                    min={1}
                    defaultValue={Number(i.stock_quantity ?? 1)}
                    onBlur={(e) => {
                      const v = Math.max(1, Math.floor(Number(e.target.value)) || 1);
                      if (v !== Number(i.stock_quantity ?? 1)) updateItemField(i.id, { stock_quantity: v });
                    }}
                    className="h-8 w-16 border-transparent bg-transparent hover:border-input focus:border-input"
                  />
                </td>

                <td className="p-3">
                  <button onClick={() => updateItemField(i.id, { active: !i.active })}>
                    <Badge variant={i.active ? "secondary" : "outline"} className="cursor-pointer">
                      {i.active ? "פעיל" : "מוסתר"}
                    </Badge>
                  </button>
                </td>

                <td className="p-3 text-left">
                  <div className="inline-flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => editItem(i)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(i.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="p-16 text-center text-muted-foreground">אין אביזרים עדיין. לחצו על "אביזר חדש".</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

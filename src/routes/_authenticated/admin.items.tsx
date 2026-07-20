import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ImageIcon, Upload, Download, FolderPlus } from "lucide-react";
import { toCSV, downloadCSV } from "@/lib/csv";

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
      const { data } = await supabase.from("items").select("*, categories(name, slug)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

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

  const del = async (id: string) => {
    if (!confirm("למחוק?")) return;
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { qc.invalidateQueries({ queryKey: ["admin-items"] }); qc.invalidateQueries({ queryKey: ["items"] }); }
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("items").upload(path, file, { upsert: false });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("items").getPublicUrl(path);
    setForm((f) => ({ ...f, image_url: data.publicUrl }));
    setUploading(false);
  };

  const createCategory = async () => {
    const name = newCatName.trim();
    if (!name) return toast.error("שם קטגוריה חובה");
    const slug = (newCatSlug.trim() || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data, error } = await supabase.from("categories").insert({ name, slug, sort_order: (categories.data?.length ?? 0) + 1 }).select().single();
    if (error) return toast.error(error.message);
    toast.success("קטגוריה נוצרה");
    setNewCatName(""); setNewCatSlug(""); setCatOpen(false);
    await qc.invalidateQueries({ queryKey: ["categories"] });
    setForm((f) => ({ ...f, category_id: data.id }));
    setBulkCat(data.id);
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
        const ext = file.name.split(".").pop();
        const path = `${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("items").upload(path, file, { upsert: false });
        if (up.error) throw up.error;
        const { data: pub } = supabase.storage.from("items").getPublicUrl(path);
        const sku = nextSkuFor(prefix, existing);
        existing.push(sku);
        const name = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || sku;
        const { error } = await supabase.from("items").insert({
          sku, name, price: bulkPrice, image_url: pub.publicUrl, category_id: bulkCat, active: true,
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
    }));
    const csv = toCSV(rows, [
      { key: "sku", label: "מק״ט" },
      { key: "category", label: "קטגוריה" },
      { key: "name", label: "שם" },
      { key: "price", label: "מחיר" },
      { key: "image_url", label: "קישור לתמונה" },
    ]);
    downloadCSV(`catalog-${new Date().toISOString().slice(0, 10)}.csv`, csv);
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
                <div><Label>שם</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
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

      {/* New category dialog */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="font-display text-2xl">קטגוריה חדשה</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>שם</Label><Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="mt-1" placeholder="לדוגמה: Vintage" /></div>
            <div><Label>קוד (slug)</Label><Input value={newCatSlug} onChange={(e) => setNewCatSlug(e.target.value)} className="mt-1" placeholder="vintage" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCatOpen(false)}>ביטול</Button>
            <Button onClick={createCategory}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="bg-card rounded-2xl border border-primary/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream/60 text-right">
            <tr>
              <th className="p-3 font-medium">תמונה</th>
              <th className="p-3 font-medium">מק״ט</th>
              <th className="p-3 font-medium">שם</th>
              <th className="p-3 font-medium">קטגוריה</th>
              <th className="p-3 font-medium">מחיר</th>
              <th className="p-3 font-medium">מצב</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((i: any) => (
              <tr key={i.id} className="border-t border-border">
                <td className="p-3">
                  <div className="h-12 w-12 rounded-lg bg-cream overflow-hidden">
                    {i.image_url ? <img src={i.image_url} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                </td>
                <td className="p-3 tracking-wider text-xs">{i.sku}</td>
                <td className="p-3 font-medium">{i.name}</td>
                <td className="p-3 text-muted-foreground">{i.categories?.name ?? "—"}</td>
                <td className="p-3 font-display text-peach-deep">₪{Number(i.price).toFixed(0)}</td>
                <td className="p-3">{i.active ? <Badge variant="secondary">פעיל</Badge> : <Badge variant="outline">מוסתר</Badge>}</td>
                <td className="p-3 text-left">
                  <div className="inline-flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => editItem(i)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(i.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="p-16 text-center text-muted-foreground">אין אביזרים עדיין. לחצו על "אביזר חדש".</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

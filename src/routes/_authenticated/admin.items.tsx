import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Plus, Pencil, Trash2, ImageIcon, Upload } from "lucide-react";

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
};

const empty: ItemForm = { sku: "", name: "", description: "", price: 0, image_url: null, category_id: null, active: true };

function ItemsAdmin() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ItemForm>(empty);
  const [uploading, setUploading] = useState(false);
  const [q, setQ] = useState("");

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("*").order("sort_order")).data ?? [],
  });

  const items = useQuery({
    queryKey: ["admin-items"],
    queryFn: async () => {
      const { data } = await supabase.from("items").select("*, categories(name)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const editItem = (i: any) => {
    setForm({
      id: i.id, sku: i.sku, name: i.name, description: i.description ?? "",
      price: Number(i.price), image_url: i.image_url, category_id: i.category_id, active: i.active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.sku) return toast.error("שם ומק״ט חובה");
    const payload = {
      sku: form.sku, name: form.name, description: form.description || null,
      price: form.price, image_url: form.image_url, category_id: form.category_id, active: form.active,
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

  const filtered = (items.data ?? []).filter((i: any) =>
    !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.sku.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input placeholder="חיפוש שם או מק״ט…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm rounded-full" />
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
                <Label>קטגוריה</Label>
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

// Outdoor package types (name / price / description / active) — moved here from the old
// /admin/outdoor-packages page when its client list was folded into the unified clients page
// ("חבילות" tab). Same table (`outdoor_package_types`) and same query key, so the order dialog's
// package picker keeps working.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Trees } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { heError } from "@/lib/he-errors";
import { hubKind } from "@/lib/client-hub";

type PackageType = {
  id: string;
  name: string;
  price: number;
  description: string;
  sort_order: number;
  active: boolean;
};

type PackageForm = {
  id?: string;
  name: string;
  price: number;
  description: string;
  active: boolean;
};

const emptyPackage: PackageForm = { name: "", price: 0, description: "", active: true };
const QUERY_KEY = ["admin-outdoor-package-types"];

export function OutdoorPackageTypesSection() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PackageForm>(emptyPackage);
  const [saving, setSaving] = useState(false);

  const packages = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("outdoor_package_types")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PackageType[];
    },
  });

  const openNew = () => {
    setForm(emptyPackage);
    setOpen(true);
  };
  const openEdit = (p: PackageType) => {
    setForm({ id: p.id, name: p.name, price: Number(p.price), description: p.description, active: p.active });
    setOpen(true);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) return toast.error("שם החבילה חובה");
    setSaving(true);
    const payload = {
      name,
      price: Math.max(0, Number(form.price || 0)),
      description: form.description.trim(),
      active: form.active,
    };
    const { error } = form.id
      ? await (supabase as any).from("outdoor_package_types").update(payload).eq("id", form.id)
      : await (supabase as any).from("outdoor_package_types").insert(payload);
    setSaving(false);
    if (error) return toast.error(heError(error.message));
    toast.success(form.id ? "החבילה עודכנה" : "החבילה נוספה");
    setOpen(false);
    qc.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const remove = async (p: PackageType) => {
    if (!confirm(`למחוק את החבילה "${p.name}"?`)) return;
    const { error } = await (supabase as any).from("outdoor_package_types").delete().eq("id", p.id);
    if (error) return toast.error(heError(error.message));
    toast.success("החבילה נמחקה");
    qc.invalidateQueries({ queryKey: QUERY_KEY });
  };

  return (
    <section className={`${hubKind("outdoor").scope} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl text-primary">
          <Trees className="h-5 w-5" /> חבילות צילומי חוץ
        </h2>
        <Button onClick={openNew} variant="outline" className="gap-2 rounded-full">
          <Plus className="h-4 w-4" /> חבילה חדשה
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-primary/10 bg-card">
        <table className="w-full text-sm">
          <thead className="bg-cream/60 text-right">
            <tr>
              <th className="p-3 font-medium">שם</th>
              <th className="p-3 font-medium">מחיר</th>
              <th className="p-3 font-medium">תיאור</th>
              <th className="p-3 font-medium">פעיל</th>
              <th className="p-3 font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {(packages.data ?? []).map((p) => (
              <tr key={p.id} className="border-t border-primary/5">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3">₪{p.price}</td>
                <td className="max-w-sm truncate p-3 text-muted-foreground">{p.description}</td>
                <td className="p-3">
                  <Badge variant={p.active ? "default" : "outline"}>{p.active ? "פעיל" : "כבוי"}</Badge>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)} aria-label="עריכה" title="עריכה">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(p)} aria-label="מחיקה" title="מחיקה">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {packages.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  אין חבילות עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className={hubKind("outdoor").scope}>
          <DialogHeader>
            <DialogTitle>{form.id ? "עריכת חבילה" : "חבילה חדשה"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>שם החבילה</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>מחיר (₪)</Label>
              <Input
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>תיאור / כלול בחבילה</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="לדוגמה: 4 סטים · 25 תמונות מעובדות · אלבום 20x30"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
              <Label>פעילה</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "שומר…" : "שמירה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

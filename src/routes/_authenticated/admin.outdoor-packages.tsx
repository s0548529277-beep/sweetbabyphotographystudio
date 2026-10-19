import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Trees, Mail, MapPin } from "lucide-react";
import { heError } from "@/lib/he-errors";
import { sendOutdoorContract } from "@/lib/outdoor-packages.functions";

export const Route = createFileRoute("/_authenticated/admin/outdoor-packages")({
  component: OutdoorPackagesAdmin,
});

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

type Order = {
  id: string;
  package_type_id: string | null;
  package_name: string | null;
  package_description: string | null;
  total_price: number | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  children_count: number | null;
  children_names: string | null;
  styling_call_date: string | null;
  session_date: string | null;
  session_time: string | null;
  deposit_paid: boolean;
  contract_sent_at: string | null;
  notes: string | null;
  created_at: string;
};

type OrderForm = {
  id?: string;
  package_type_id: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  children_count: string;
  children_names: string;
  styling_call_date: string;
  session_date: string;
  session_time: string;
  deposit_paid: boolean;
  notes: string;
};

const emptyOrder: OrderForm = {
  package_type_id: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  children_count: "",
  children_names: "",
  styling_call_date: "",
  session_date: "",
  session_time: "",
  deposit_paid: false,
  notes: "",
};

function OutdoorPackagesAdmin() {
  const qc = useQueryClient();
  const sendContractFn = useServerFn(sendOutdoorContract);

  const [pkgOpen, setPkgOpen] = useState(false);
  const [pkgForm, setPkgForm] = useState<PackageForm>(emptyPackage);
  const [pkgSaving, setPkgSaving] = useState(false);

  const [orderOpen, setOrderOpen] = useState(false);
  const [orderForm, setOrderForm] = useState<OrderForm>(emptyOrder);
  const [orderSaving, setOrderSaving] = useState(false);
  const [sendingContractId, setSendingContractId] = useState<string | null>(null);

  const packages = useQuery({
    queryKey: ["admin-outdoor-package-types"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("outdoor_package_types")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PackageType[];
    },
  });

  const orders = useQuery({
    queryKey: ["admin-outdoor-orders"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("outdoor_package_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  const openNewPkg = () => {
    setPkgForm(emptyPackage);
    setPkgOpen(true);
  };
  const openEditPkg = (p: PackageType) => {
    setPkgForm({ id: p.id, name: p.name, price: Number(p.price), description: p.description, active: p.active });
    setPkgOpen(true);
  };
  const savePkg = async () => {
    const name = pkgForm.name.trim();
    if (!name) return toast.error("שם החבילה חובה");
    setPkgSaving(true);
    const payload = {
      name,
      price: Math.max(0, Number(pkgForm.price || 0)),
      description: pkgForm.description.trim(),
      active: pkgForm.active,
    };
    const { error } = pkgForm.id
      ? await (supabase as any).from("outdoor_package_types").update(payload).eq("id", pkgForm.id)
      : await (supabase as any).from("outdoor_package_types").insert(payload);
    setPkgSaving(false);
    if (error) return toast.error(heError(error.message));
    toast.success(pkgForm.id ? "החבילה עודכנה" : "החבילה נוספה");
    setPkgOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-outdoor-package-types"] });
  };
  const removePkg = async (p: PackageType) => {
    if (!confirm(`למחוק את החבילה "${p.name}"?`)) return;
    const { error } = await (supabase as any).from("outdoor_package_types").delete().eq("id", p.id);
    if (error) return toast.error(heError(error.message));
    toast.success("החבילה נמחקה");
    qc.invalidateQueries({ queryKey: ["admin-outdoor-package-types"] });
  };

  const openNewOrder = () => {
    setOrderForm(emptyOrder);
    setOrderOpen(true);
  };
  const openEditOrder = (o: Order) => {
    setOrderForm({
      id: o.id,
      package_type_id: o.package_type_id ?? "",
      contact_name: o.contact_name,
      contact_phone: o.contact_phone,
      contact_email: o.contact_email ?? "",
      children_count: o.children_count != null ? String(o.children_count) : "",
      children_names: o.children_names ?? "",
      styling_call_date: o.styling_call_date ?? "",
      session_date: o.session_date ?? "",
      session_time: o.session_time ?? "",
      deposit_paid: o.deposit_paid,
      notes: o.notes ?? "",
    });
    setOrderOpen(true);
  };

  const saveOrder = async () => {
    const name = orderForm.contact_name.trim();
    const phone = orderForm.contact_phone.trim();
    if (!name) return toast.error("שם הלקוחה חובה");
    if (!phone) return toast.error("טלפון חובה");
    setOrderSaving(true);
    const chosenPkg = (packages.data ?? []).find((p) => p.id === orderForm.package_type_id);
    const payload = {
      package_type_id: orderForm.package_type_id || null,
      package_name: chosenPkg?.name ?? null,
      package_description: chosenPkg?.description ?? null,
      total_price: chosenPkg?.price ?? null,
      contact_name: name,
      contact_phone: phone,
      contact_email: orderForm.contact_email.trim() || null,
      children_count: orderForm.children_count ? Number(orderForm.children_count) : null,
      children_names: orderForm.children_names.trim() || null,
      styling_call_date: orderForm.styling_call_date || null,
      session_date: orderForm.session_date || null,
      session_time: orderForm.session_time || null,
      deposit_paid: orderForm.deposit_paid,
      notes: orderForm.notes.trim() || null,
    };
    const { error } = orderForm.id
      ? await (supabase as any).from("outdoor_package_orders").update(payload).eq("id", orderForm.id)
      : await (supabase as any).from("outdoor_package_orders").insert(payload);
    setOrderSaving(false);
    if (error) return toast.error(heError(error.message));
    toast.success(orderForm.id ? "הלקוחה עודכנה" : "הלקוחה נוספה");
    setOrderOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-outdoor-orders"] });
  };

  const removeOrder = async (o: Order) => {
    if (!confirm(`למחוק את ${o.contact_name}?`)) return;
    const { error } = await (supabase as any).from("outdoor_package_orders").delete().eq("id", o.id);
    if (error) return toast.error(heError(error.message));
    toast.success("נמחק");
    qc.invalidateQueries({ queryKey: ["admin-outdoor-orders"] });
  };

  const toggleDeposit = async (o: Order) => {
    const { error } = await (supabase as any)
      .from("outdoor_package_orders")
      .update({ deposit_paid: !o.deposit_paid })
      .eq("id", o.id);
    if (error) return toast.error(heError(error.message));
    qc.invalidateQueries({ queryKey: ["admin-outdoor-orders"] });
  };

  const sendContract = async (o: Order) => {
    if (!o.contact_email) return toast.error("לא נמצאה כתובת מייל ללקוחה הזו");
    if (!o.session_date) return toast.error("יש להגדיר תאריך צילום לפני שליחת החוזה");
    setSendingContractId(o.id);
    try {
      await sendContractFn({ data: { id: o.id } });
      toast.success("החוזה נשלח");
      qc.invalidateQueries({ queryKey: ["admin-outdoor-orders"] });
    } catch (e: any) {
      toast.error(e?.message ?? "שליחת החוזה נכשלה");
    } finally {
      setSendingContractId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-primary flex items-center gap-2">
            <Trees className="h-5 w-5" /> חבילות צילומי חוץ
          </h2>
          <Button onClick={openNewPkg} className="rounded-full gap-2" variant="outline">
            <Plus className="h-4 w-4" /> חבילה חדשה
          </Button>
        </div>

        <div className="mt-3 bg-card rounded-2xl border border-primary/5 overflow-x-auto">
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
                  <td className="p-3 text-forest/70 max-w-sm truncate">{p.description}</td>
                  <td className="p-3">
                    <Badge variant={p.active ? "default" : "outline"}>{p.active ? "פעיל" : "כבוי"}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditPkg(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => removePkg(p)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {packages.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-forest/60">
                    אין חבילות עדיין
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-primary flex items-center gap-2">
            <MapPin className="h-5 w-5" /> לקוחות צילומי חוץ
          </h2>
          <Button onClick={openNewOrder} className="rounded-full gap-2">
            <Plus className="h-4 w-4" /> לקוחה חדשה
          </Button>
        </div>

        <div className="mt-3 bg-card rounded-2xl border border-primary/5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream/60 text-right">
              <tr>
                <th className="p-3 font-medium">לקוחה</th>
                <th className="p-3 font-medium">חבילה</th>
                <th className="p-3 font-medium">שיחת סטיילינג</th>
                <th className="p-3 font-medium">תאריך ושעת צילום</th>
                <th className="p-3 font-medium">מקדמה</th>
                <th className="p-3 font-medium">חוזה</th>
                <th className="p-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {(orders.data ?? []).map((o) => (
                <tr key={o.id} className="border-t border-primary/5">
                  <td className="p-3">
                    <div className="font-medium">{o.contact_name}</div>
                    <div className="text-forest/60 text-xs" dir="ltr">
                      {o.contact_phone}
                      {o.contact_email ? ` · ${o.contact_email}` : ""}
                    </div>
                    {o.children_count != null && (
                      <div className="text-forest/60 text-xs">
                        {o.children_count} ילדים{o.children_names ? `: ${o.children_names}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {o.package_name ?? "—"}
                    {o.total_price != null && <div className="text-forest/60 text-xs">₪{o.total_price}</div>}
                  </td>
                  <td className="p-3">{o.styling_call_date ?? "—"}</td>
                  <td className="p-3">
                    {o.session_date ?? "—"}
                    {o.session_time ? ` · ${o.session_time}` : ""}
                  </td>
                  <td className="p-3">
                    <button onClick={() => toggleDeposit(o)}>
                      <Badge variant={o.deposit_paid ? "default" : "outline"} className="cursor-pointer">
                        {o.deposit_paid ? "התקבלה" : "לא התקבלה"}
                      </Badge>
                    </button>
                  </td>
                  <td className="p-3">
                    {o.contract_sent_at ? (
                      <Badge variant="default">נשלח</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={sendingContractId === o.id}
                        onClick={() => sendContract(o)}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {sendingContractId === o.id ? "שולח…" : "שליחת חוזה"}
                      </Button>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditOrder(o)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => removeOrder(o)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {orders.data?.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-forest/60">
                    אין לקוחות עדיין
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Package type dialog */}
      <Dialog open={pkgOpen} onOpenChange={setPkgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pkgForm.id ? "עריכת חבילה" : "חבילה חדשה"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>שם החבילה</Label>
              <Input value={pkgForm.name} onChange={(e) => setPkgForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>מחיר (₪)</Label>
              <Input
                type="number"
                min={0}
                value={pkgForm.price}
                onChange={(e) => setPkgForm((f) => ({ ...f, price: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>תיאור / כלול בחבילה</Label>
              <Textarea
                value={pkgForm.description}
                onChange={(e) => setPkgForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="לדוגמה: 4 סטים · 25 תמונות מעובדות · אלבום 20x30"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={pkgForm.active} onCheckedChange={(v) => setPkgForm((f) => ({ ...f, active: v }))} />
              <Label>פעילה</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPkgOpen(false)}>
              ביטול
            </Button>
            <Button onClick={savePkg} disabled={pkgSaving}>
              {pkgSaving ? "שומר…" : "שמירה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order dialog */}
      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{orderForm.id ? "עריכת לקוחה" : "לקוחה חדשה"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>שם הלקוחה</Label>
                <Input
                  value={orderForm.contact_name}
                  onChange={(e) => setOrderForm((f) => ({ ...f, contact_name: e.target.value }))}
                />
              </div>
              <div>
                <Label>טלפון</Label>
                <Input
                  dir="ltr"
                  value={orderForm.contact_phone}
                  onChange={(e) => setOrderForm((f) => ({ ...f, contact_phone: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>מייל</Label>
              <Input
                dir="ltr"
                type="email"
                value={orderForm.contact_email}
                onChange={(e) => setOrderForm((f) => ({ ...f, contact_email: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>מספר ילדים</Label>
                <Input
                  type="number"
                  min={0}
                  value={orderForm.children_count}
                  onChange={(e) => setOrderForm((f) => ({ ...f, children_count: e.target.value }))}
                />
              </div>
              <div>
                <Label>שמות הילדים</Label>
                <Input
                  value={orderForm.children_names}
                  onChange={(e) => setOrderForm((f) => ({ ...f, children_names: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>חבילה</Label>
              <Select
                value={orderForm.package_type_id}
                onValueChange={(v) => setOrderForm((f) => ({ ...f, package_type_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחירת חבילה" />
                </SelectTrigger>
                <SelectContent>
                  {(packages.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — ₪{p.price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>תאריך שיחת סטיילינג</Label>
              <Input
                type="date"
                value={orderForm.styling_call_date}
                onChange={(e) => setOrderForm((f) => ({ ...f, styling_call_date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>תאריך הצילום</Label>
                <Input
                  type="date"
                  value={orderForm.session_date}
                  onChange={(e) => setOrderForm((f) => ({ ...f, session_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>שעת הצילום</Label>
                <Input
                  type="time"
                  value={orderForm.session_time}
                  onChange={(e) => setOrderForm((f) => ({ ...f, session_time: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={orderForm.deposit_paid}
                onCheckedChange={(v) => setOrderForm((f) => ({ ...f, deposit_paid: v }))}
              />
              <Label>המקדמה התקבלה</Label>
            </div>
            <div>
              <Label>הערות</Label>
              <Textarea
                value={orderForm.notes}
                onChange={(e) => setOrderForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderOpen(false)}>
              ביטול
            </Button>
            <Button onClick={saveOrder} disabled={orderSaving}>
              {orderSaving ? "שומר…" : "שמירה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

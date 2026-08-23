import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listClientEmails } from "@/lib/admin-clients.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Layers, IdCard } from "lucide-react";
import { heError } from "@/lib/he-errors";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  component: SubscriptionsAdmin,
});

type Plan = { id: string; name: string; total_entries: number; price: number; active: boolean };
type PlanForm = { id?: string; name: string; total_entries: number; price: number; active: boolean };
const emptyPlan: PlanForm = { name: "", total_entries: 11, price: 0, active: true };

type Pass = {
  id: string;
  user_id: string;
  plan_id: string | null;
  plan_name: string;
  total_entries: number;
  entries_used: number;
  price_paid: number;
  status: "active" | "cancelled";
  notes: string | null;
  purchased_at: string;
};
type PassForm = { user_id: string; plan_id: string; plan_name: string; total_entries: number; price_paid: number; notes: string };
const emptyPass: PassForm = { user_id: "", plan_id: "", plan_name: "", total_entries: 11, price_paid: 0, notes: "" };

function SubscriptionsAdmin() {
  const qc = useQueryClient();
  const fetchEmails = useServerFn(listClientEmails);
  const emailsQ = useQuery({ queryKey: ["admin-client-emails"], queryFn: () => fetchEmails({ data: {} } as any) });
  const emails: Record<string, string> = (emailsQ.data as any) ?? {};

  // ---------- Plan templates ----------
  const [planOpen, setPlanOpen] = useState(false);
  const [planForm, setPlanForm] = useState<PlanForm>(emptyPlan);
  const [planSaving, setPlanSaving] = useState(false);

  const plans = useQuery({
    queryKey: ["admin-subscription-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscription_plans").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const openNewPlan = () => { setPlanForm(emptyPlan); setPlanOpen(true); };
  const openEditPlan = (p: Plan) => { setPlanForm({ id: p.id, name: p.name, total_entries: p.total_entries, price: Number(p.price), active: p.active }); setPlanOpen(true); };

  const savePlan = async () => {
    const name = planForm.name.trim();
    if (!name) return toast.error("שם החבילה חובה");
    if (!planForm.total_entries || planForm.total_entries < 1) return toast.error("מספר כניסות חייב להיות לפחות 1");
    setPlanSaving(true);
    const payload = { name, total_entries: Math.floor(planForm.total_entries), price: Math.max(0, planForm.price), active: planForm.active };
    const { error } = planForm.id
      ? await supabase.from("subscription_plans").update(payload).eq("id", planForm.id)
      : await supabase.from("subscription_plans").insert(payload);
    setPlanSaving(false);
    if (error) return toast.error(heError(error.message));
    toast.success(planForm.id ? "החבילה עודכנה" : "החבילה נוספה");
    setPlanOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
  };

  const togglePlanActive = async (p: Plan) => {
    const { error } = await supabase.from("subscription_plans").update({ active: !p.active }).eq("id", p.id);
    if (error) return toast.error(heError(error.message));
    qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
  };

  const removePlan = async (p: Plan) => {
    if (!confirm(`למחוק את תבנית החבילה "${p.name}"? כרטיסיות שכבר נוצרו ממנה לא יימחקו.`)) return;
    const { error } = await supabase.from("subscription_plans").delete().eq("id", p.id);
    if (error) return toast.error(heError(error.message));
    toast.success("התבנית נמחקה");
    qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
  };

  // ---------- Customer passes ----------
  const [passOpen, setPassOpen] = useState(false);
  const [passForm, setPassForm] = useState<PassForm>(emptyPass);
  const [passSaving, setPassSaving] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");

  const clients = useQuery({
    queryKey: ["admin-clients-for-passes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, phone").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const passes = useQuery({
    queryKey: ["admin-subscription-passes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscription_passes").select("*").order("purchased_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pass[];
    },
  });

  const matchingClients = (clients.data ?? []).filter((c: any) =>
    !customerQuery ||
    (c.full_name ?? "").toLowerCase().includes(customerQuery.toLowerCase()) ||
    (c.phone ?? "").includes(customerQuery) ||
    (emails[c.id] ?? "").toLowerCase().includes(customerQuery.toLowerCase()),
  );

  const openNewPass = () => { setPassForm(emptyPass); setCustomerQuery(""); setPassOpen(true); };

  const pickPlanForPass = (planId: string) => {
    const plan = plans.data?.find((p) => p.id === planId);
    setPassForm((f) => ({
      ...f,
      plan_id: planId,
      plan_name: plan?.name ?? f.plan_name,
      total_entries: plan?.total_entries ?? f.total_entries,
      price_paid: plan ? Number(plan.price) : f.price_paid,
    }));
  };

  const savePass = async () => {
    if (!passForm.user_id) return toast.error("יש לבחור לקוחה");
    if (!passForm.plan_name.trim()) return toast.error("שם החבילה חובה");
    if (!passForm.total_entries || passForm.total_entries < 1) return toast.error("מספר כניסות חייב להיות לפחות 1");
    setPassSaving(true);
    const { error } = await supabase.from("subscription_passes").insert({
      user_id: passForm.user_id,
      plan_id: passForm.plan_id || null,
      plan_name: passForm.plan_name.trim(),
      total_entries: Math.floor(passForm.total_entries),
      price_paid: Math.max(0, passForm.price_paid),
      notes: passForm.notes.trim() || null,
    });
    setPassSaving(false);
    if (error) return toast.error(heError(error.message));
    toast.success("הכרטיסייה נוצרה");
    setPassOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-subscription-passes"] });
  };

  const cancelPass = async (p: Pass) => {
    if (!confirm("לבטל את הכרטיסייה? הכניסות שנשארו לא יהיו זמינות יותר.")) return;
    const { error } = await supabase.from("subscription_passes").update({ status: "cancelled" }).eq("id", p.id);
    if (error) return toast.error(heError(error.message));
    toast.success("הכרטיסייה בוטלה");
    qc.invalidateQueries({ queryKey: ["admin-subscription-passes"] });
  };

  const clientLabel = (userId: string) => {
    const c = clients.data?.find((x: any) => x.id === userId) as any;
    return c?.full_name || emails[userId] || userId.slice(0, 8);
  };

  return (
    <div className="space-y-10">
      {/* Plan templates */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-primary flex items-center gap-2">
            <Layers className="h-5 w-5" /> תבניות חבילה
          </h2>
          <Button onClick={openNewPlan} className="rounded-full gap-2">
            <Plus className="h-4 w-4" /> תבנית חדשה
          </Button>
        </div>
        <p className="text-sm text-forest/70">
          תבניות ניתנות לעריכה בכל עת — לדוגמה "SWEET 10+1" (11 כניסות). כל כניסה בכרטיסייה מכסה שעה ראשונה בהשכרת סטודיו בלבד; שעות נוספות בתשלום נפרד כרגיל.
        </p>
        <div className="bg-card rounded-2xl border border-primary/5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream/60 text-right">
              <tr>
                <th className="p-3 font-medium">שם</th>
                <th className="p-3 font-medium">כניסות</th>
                <th className="p-3 font-medium">מחיר</th>
                <th className="p-3 font-medium">פעיל</th>
                <th className="p-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {(plans.data ?? []).map((p) => (
                <tr key={p.id} className="border-t border-primary/5">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3">{p.total_entries}</td>
                  <td className="p-3">₪{Number(p.price).toFixed(0)}</td>
                  <td className="p-3">
                    <button onClick={() => togglePlanActive(p)}>
                      <Badge variant={p.active ? "default" : "outline"} className="cursor-pointer">
                        {p.active ? "פעיל" : "כבוי"}
                      </Badge>
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditPlan(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => removePlan(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {plans.data?.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-forest/60">אין תבניות עדיין</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer passes */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-primary flex items-center gap-2">
            <IdCard className="h-5 w-5" /> כרטיסיות לקוחות
          </h2>
          <Button onClick={openNewPass} className="rounded-full gap-2">
            <Plus className="h-4 w-4" /> כרטיסייה חדשה
          </Button>
        </div>
        <p className="text-sm text-forest/70">
          יוצרים כרטיסייה ידנית אחרי אישור תשלום (העברה בנקאית). כל כניסה נוצלת אוטומטית כשהלקוחה מזמינה סטודיו דרך /booking ומסמנת "שימוש בכרטיסייה" — הכניסות מתעדכנות כאן בזמן אמת.
        </p>
        <div className="bg-card rounded-2xl border border-primary/5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream/60 text-right">
              <tr>
                <th className="p-3 font-medium">לקוחה</th>
                <th className="p-3 font-medium">חבילה</th>
                <th className="p-3 font-medium">כניסות</th>
                <th className="p-3 font-medium">שולם</th>
                <th className="p-3 font-medium">מצב</th>
                <th className="p-3 font-medium">תאריך</th>
                <th className="p-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {(passes.data ?? []).map((p) => (
                <tr key={p.id} className="border-t border-primary/5">
                  <td className="p-3 font-medium">{clientLabel(p.user_id)}</td>
                  <td className="p-3">{p.plan_name}</td>
                  <td className="p-3">{p.entries_used} / {p.total_entries}</td>
                  <td className="p-3">₪{Number(p.price_paid).toFixed(0)}</td>
                  <td className="p-3">
                    <Badge variant={p.status === "active" ? "default" : "outline"}>
                      {p.status === "active" ? "פעילה" : "מבוטלת"}
                    </Badge>
                  </td>
                  <td className="p-3 text-forest/70">{new Date(p.purchased_at).toLocaleDateString("he-IL")}</td>
                  <td className="p-3">
                    {p.status === "active" && (
                      <Button size="icon" variant="ghost" onClick={() => cancelPass(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    )}
                  </td>
                </tr>
              ))}
              {passes.data?.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-forest/60">אין כרטיסיות עדיין</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan dialog */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{planForm.id ? "עריכת תבנית" : "תבנית חבילה חדשה"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>שם החבילה</Label>
              <Input value={planForm.name} onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))} placeholder="לדוגמה: SWEET 10+1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>מספר כניסות</Label>
                <Input type="number" min={1} value={planForm.total_entries} onChange={(e) => setPlanForm((f) => ({ ...f, total_entries: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>מחיר (₪)</Label>
                <Input type="number" min={0} value={planForm.price} onChange={(e) => setPlanForm((f) => ({ ...f, price: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={planForm.active} onCheckedChange={(v) => setPlanForm((f) => ({ ...f, active: v }))} />
              <Label>פעילה</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>ביטול</Button>
            <Button onClick={savePlan} disabled={planSaving}>{planSaving ? "שומר…" : "שמירה"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New pass dialog */}
      <Dialog open={passOpen} onOpenChange={setPassOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>כרטיסייה חדשה</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>לקוחה</Label>
              <Input
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="חיפוש שם, טלפון או אימייל…"
                className="mb-2"
              />
              <div className="max-h-40 overflow-y-auto border border-input rounded-md">
                {matchingClients.slice(0, 30).map((c: any) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPassForm((f) => ({ ...f, user_id: c.id }))}
                    className={`w-full text-right px-3 py-2 text-sm hover:bg-accent ${passForm.user_id === c.id ? "bg-accent" : ""}`}
                  >
                    {c.full_name || "ללא שם"} · <span dir="ltr">{c.phone || emails[c.id] || "—"}</span>
                  </button>
                ))}
                {matchingClients.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">אין תוצאות</div>}
              </div>
              {passForm.user_id && (
                <p className="text-xs text-forest/70 mt-1">נבחרה: {clientLabel(passForm.user_id)}</p>
              )}
            </div>
            <div>
              <Label>תבנית חבילה (אופציונלי — ממלא אוטומטית)</Label>
              <Select value={passForm.plan_id} onValueChange={pickPlanForPass}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="בחר תבנית" /></SelectTrigger>
                <SelectContent>
                  {(plans.data ?? []).filter((p) => p.active).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — {p.total_entries} כניסות · ₪{Number(p.price).toFixed(0)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>שם החבילה (יוצג ללקוחה)</Label>
              <Input value={passForm.plan_name} onChange={(e) => setPassForm((f) => ({ ...f, plan_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>מספר כניסות</Label>
                <Input type="number" min={1} value={passForm.total_entries} onChange={(e) => setPassForm((f) => ({ ...f, total_entries: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>שולם בפועל (₪)</Label>
                <Input type="number" min={0} value={passForm.price_paid} onChange={(e) => setPassForm((f) => ({ ...f, price_paid: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <Label>הערות (אופציונלי)</Label>
              <Textarea rows={2} value={passForm.notes} onChange={(e) => setPassForm((f) => ({ ...f, notes: e.target.value }))} placeholder="לדוגמה: אסמכתא התקבלה במייל 23.8" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPassOpen(false)}>ביטול</Button>
            <Button onClick={savePass} disabled={passSaving}>{passSaving ? "שומר…" : "יצירת כרטיסייה"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

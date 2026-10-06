import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listClientEmails } from "@/lib/admin-clients.functions";
import { adminAdjustSubscriptionPassEntries } from "@/lib/admin-subscriptions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Layers,
  IdCard,
  History,
  CalendarClock,
  CreditCard,
  X,
} from "lucide-react";
import { heError } from "@/lib/he-errors";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  component: SubscriptionsAdmin,
});

type Plan = {
  id: string;
  name: string;
  total_entries: number;
  price: number;
  validity_months: number;
  active: boolean;
};
type PlanForm = {
  id?: string;
  name: string;
  total_entries: number;
  price: number;
  validity_months: number;
  active: boolean;
};
const emptyPlan: PlanForm = {
  name: "",
  total_entries: 5,
  price: 0,
  validity_months: 6,
  active: true,
};

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
  purchase_source: string;
  purchased_at: string;
  expires_at: string;
};
type PassForm = {
  user_id: string;
  plan_id: string;
  plan_name: string;
  total_entries: number;
  price_paid: number;
  validity_months: number;
  payment_received: boolean;
  notes: string;
};
const emptyPass: PassForm = {
  user_id: "",
  plan_id: "",
  plan_name: "",
  total_entries: 5,
  price_paid: 0,
  validity_months: 6,
  payment_received: true,
  notes: "",
};

type BookingRow = {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
};
type AdjustmentRow = { id: string; delta: number; note: string; created_at: string };

// Derived at read time rather than stored — a pass's "real" state depends
// on today's date and its own counters, not a value that needs a cron job
// to keep in sync.
type DerivedStatus = "active" | "used_up" | "expired" | "cancelled";
function derivedStatus(p: Pass): DerivedStatus {
  if (p.status === "cancelled") return "cancelled";
  if (new Date(p.expires_at) < new Date()) return "expired";
  if (p.entries_used >= p.total_entries) return "used_up";
  return "active";
}
const STATUS_LABELS: Record<DerivedStatus, string> = {
  active: "פעילה",
  used_up: "נוצלה",
  expired: "פג תוקף",
  cancelled: "בוטלה",
};
const STATUS_FILTERS: { id: DerivedStatus | "all"; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "active", label: "פעילה" },
  { id: "used_up", label: "נוצלה" },
  { id: "expired", label: "פג תוקף" },
  { id: "cancelled", label: "בוטלה" },
];

function SubscriptionsAdmin() {
  const qc = useQueryClient();
  const fetchEmails = useServerFn(listClientEmails);
  const emailsQ = useQuery({
    queryKey: ["admin-client-emails"],
    queryFn: () => fetchEmails({ data: {} } as any),
  });
  const emails: Record<string, string> = (emailsQ.data as any) ?? {};
  const adjustEntries = useServerFn(adminAdjustSubscriptionPassEntries);

  // ---------- Plan templates ----------
  const [planOpen, setPlanOpen] = useState(false);
  const [planForm, setPlanForm] = useState<PlanForm>(emptyPlan);
  const [planSaving, setPlanSaving] = useState(false);

  const plans = useQuery({
    queryKey: ["admin-subscription-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Plan[];
    },
  });

  const openNewPlan = () => {
    setPlanForm(emptyPlan);
    setPlanOpen(true);
  };
  const openEditPlan = (p: Plan) => {
    setPlanForm({
      id: p.id,
      name: p.name,
      total_entries: p.total_entries,
      price: Number(p.price),
      validity_months: p.validity_months,
      active: p.active,
    });
    setPlanOpen(true);
  };

  const savePlan = async () => {
    const name = planForm.name.trim();
    if (!name) return toast.error("שם החבילה חובה");
    if (!planForm.total_entries || planForm.total_entries < 1)
      return toast.error("מספר כניסות חייב להיות לפחות 1");
    if (!planForm.validity_months || planForm.validity_months < 1)
      return toast.error("תוקף בחודשים חייב להיות לפחות 1");
    setPlanSaving(true);
    const payload = {
      name,
      total_entries: Math.floor(planForm.total_entries),
      price: Math.max(0, planForm.price),
      validity_months: Math.floor(planForm.validity_months),
      active: planForm.active,
    };
    const { error } = planForm.id
      ? await supabase
          .from("subscription_plans" as never)
          .update(payload as never)
          .eq("id", planForm.id)
      : await supabase.from("subscription_plans" as never).insert(payload as never);
    setPlanSaving(false);
    if (error) return toast.error(heError(error.message));
    toast.success(planForm.id ? "החבילה עודכנה" : "החבילה נוספה");
    setPlanOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
  };

  const togglePlanActive = async (p: Plan) => {
    const { error } = await supabase
      .from("subscription_plans" as never)
      .update({ active: !p.active } as never)
      .eq("id", p.id);
    if (error) return toast.error(heError(error.message));
    qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
  };

  const removePlan = async (p: Plan) => {
    if (!confirm(`למחוק את תבנית החבילה "${p.name}"? כרטיסיות שכבר נוצרו ממנה לא יימחקו.`)) return;
    const { error } = await supabase
      .from("subscription_plans" as never)
      .delete()
      .eq("id", p.id);
    if (error) return toast.error(heError(error.message));
    toast.success("התבנית נמחקה");
    qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
  };

  // ---------- Customer passes ----------
  const [passOpen, setPassOpen] = useState(false);
  const [passForm, setPassForm] = useState<PassForm>(emptyPass);
  const [passSaving, setPassSaving] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DerivedStatus | "all">("all");
  const [detailPassId, setDetailPassId] = useState<string | null>(null);

  const clients = useQuery({
    queryKey: ["admin-clients-for-passes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const passes = useQuery({
    queryKey: ["admin-subscription-passes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_passes" as never)
        .select("*")
        .order("purchased_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Pass[];
    },
  });

  const visiblePasses = (passes.data ?? []).filter(
    (p) => statusFilter === "all" || derivedStatus(p) === statusFilter,
  );

  const matchingClients = (clients.data ?? []).filter(
    (c: any) =>
      !customerQuery ||
      (c.full_name ?? "").toLowerCase().includes(customerQuery.toLowerCase()) ||
      (c.phone ?? "").includes(customerQuery) ||
      (emails[c.id] ?? "").toLowerCase().includes(customerQuery.toLowerCase()),
  );

  const openNewPass = () => {
    setPassForm(emptyPass);
    setCustomerQuery("");
    setPassOpen(true);
  };

  const pickPlanForPass = (planId: string) => {
    const plan = plans.data?.find((p) => p.id === planId);
    setPassForm((f) => ({
      ...f,
      plan_id: planId,
      plan_name: plan?.name ?? f.plan_name,
      total_entries: plan?.total_entries ?? f.total_entries,
      price_paid: plan ? Number(plan.price) : f.price_paid,
      validity_months: plan?.validity_months ?? f.validity_months,
    }));
  };

  const savePass = async () => {
    if (!passForm.user_id) return toast.error("יש לבחור לקוחה");
    if (!passForm.plan_name.trim()) return toast.error("שם החבילה חובה");
    if (!passForm.total_entries || passForm.total_entries < 1)
      return toast.error("מספר כניסות חייב להיות לפחות 1");
    setPassSaving(true);
    const expiresAt = new Date();
    expiresAt.setMonth(
      expiresAt.getMonth() + Math.max(1, Math.floor(passForm.validity_months || 6)),
    );
    const { error } = await supabase.from("subscription_passes" as never).insert({
      user_id: passForm.user_id,
      plan_id: passForm.plan_id || null,
      plan_name: passForm.plan_name.trim(),
      total_entries: Math.floor(passForm.total_entries),
      price_paid: Math.max(0, passForm.price_paid),
      expires_at: expiresAt.toISOString(),
      purchase_source: "admin",
      notes:
        [passForm.payment_received ? null : "⚠ תשלום טרם אומת", passForm.notes.trim() || null]
          .filter(Boolean)
          .join(" · ") || null,
    } as never);
    setPassSaving(false);
    if (error) return toast.error(heError(error.message));
    toast.success("הכרטיסייה נוצרה");
    setPassOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-subscription-passes"] });
  };

  const cancelPass = async (p: Pass) => {
    if (!confirm("לבטל את הכרטיסייה? הכניסות שנשארו לא יהיו זמינות יותר.")) return;
    const { error } = await supabase
      .from("subscription_passes" as never)
      .update({ status: "cancelled" } as never)
      .eq("id", p.id);
    if (error) return toast.error(heError(error.message));
    toast.success("הכרטיסייה בוטלה");
    qc.invalidateQueries({ queryKey: ["admin-subscription-passes"] });
  };

  const clientLabel = (userId: string) => {
    const c = clients.data?.find((x: any) => x.id === userId) as any;
    return c?.full_name || emails[userId] || userId.slice(0, 8);
  };

  const detailPass = (passes.data ?? []).find((p) => p.id === detailPassId) ?? null;

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
          תבניות ניתנות לעריכה בכל עת. כל כניסה בכרטיסייה מכסה שעה ראשונה בהשכרת סטודיו לפי שעה
          בלבד; שעות נוספות בתשלום נפרד כרגיל, בלי קאשבק ובלי הנחת צלמות קבועות כל עוד הכרטיסייה
          פעילה.
        </p>
        <div className="bg-card rounded-2xl border border-primary/5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream/60 text-right">
              <tr>
                <th className="p-3 font-medium">שם</th>
                <th className="p-3 font-medium">כניסות</th>
                <th className="p-3 font-medium">מחיר</th>
                <th className="p-3 font-medium">תוקף</th>
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
                  <td className="p-3">{p.validity_months} חודשים</td>
                  <td className="p-3">
                    <button onClick={() => togglePlanActive(p)}>
                      <Badge variant={p.active ? "default" : "outline"} className="cursor-pointer">
                        {p.active ? "פעיל" : "כבוי"}
                      </Badge>
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditPlan(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => removePlan(p)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {plans.data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-forest/60">
                    אין תבניות עדיין
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer passes */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-display text-2xl text-primary flex items-center gap-2">
            <IdCard className="h-5 w-5" /> כרטיסיות לקוחות
          </h2>
          <Button onClick={openNewPass} className="rounded-full gap-2">
            <Plus className="h-4 w-4" /> כרטיסייה חדשה
          </Button>
        </div>
        <p className="text-sm text-forest/70">
          יוצרים כרטיסייה ידנית אחרי אישור תשלום, או שלקוחה רוכשת בעצמה באשראי דרך האזור האישי שלה —
          שתי הדרכים מופיעות כאן יחד.
        </p>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStatusFilter(s.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                statusFilter === s.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-cream/60 text-forest/70 hover:bg-cream"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="bg-card rounded-2xl border border-primary/5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream/60 text-right">
              <tr>
                <th className="p-3 font-medium">לקוחה</th>
                <th className="p-3 font-medium">חבילה</th>
                <th className="p-3 font-medium">כניסות</th>
                <th className="p-3 font-medium">שולם</th>
                <th className="p-3 font-medium">מקור</th>
                <th className="p-3 font-medium">תוקף עד</th>
                <th className="p-3 font-medium">מצב</th>
                <th className="p-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {visiblePasses.map((p) => {
                const status = derivedStatus(p);
                return (
                  <tr key={p.id} className="border-t border-primary/5">
                    <td className="p-3 font-medium">{clientLabel(p.user_id)}</td>
                    <td className="p-3">{p.plan_name}</td>
                    <td className="p-3">
                      {p.entries_used} / {p.total_entries}
                    </td>
                    <td className="p-3">₪{Number(p.price_paid).toFixed(0)}</td>
                    <td className="p-3">
                      {p.purchase_source === "online_card" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-forest/70">
                          <CreditCard className="h-3 w-3" /> אשראי
                        </span>
                      ) : (
                        <span className="text-xs text-forest/50">ידני</span>
                      )}
                    </td>
                    <td className="p-3 text-forest/70">
                      {new Date(p.expires_at).toLocaleDateString("he-IL")}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          status === "active"
                            ? "default"
                            : status === "cancelled"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {STATUS_LABELS[status]}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full gap-1"
                          onClick={() => setDetailPassId(p.id)}
                        >
                          <History className="h-3.5 w-3.5" /> פרטים
                        </Button>
                        {p.status === "active" && (
                          <Button size="icon" variant="ghost" onClick={() => cancelPass(p)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visiblePasses.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-forest/60">
                    אין כרטיסיות בסינון הנוכחי
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan dialog */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{planForm.id ? "עריכת תבנית" : "תבנית חבילה חדשה"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>שם החבילה</Label>
              <Input
                value={planForm.name}
                onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="לדוגמה: כרטיסיית 5 כניסות"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>מספר כניסות</Label>
                <Input
                  type="number"
                  min={1}
                  value={planForm.total_entries}
                  onChange={(e) =>
                    setPlanForm((f) => ({ ...f, total_entries: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <Label>מחיר (₪)</Label>
                <Input
                  type="number"
                  min={0}
                  value={planForm.price}
                  onChange={(e) => setPlanForm((f) => ({ ...f, price: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>תוקף (חודשים)</Label>
                <Input
                  type="number"
                  min={1}
                  value={planForm.validity_months}
                  onChange={(e) =>
                    setPlanForm((f) => ({ ...f, validity_months: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={planForm.active}
                onCheckedChange={(v) => setPlanForm((f) => ({ ...f, active: v }))}
              />
              <Label>פעילה</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>
              ביטול
            </Button>
            <Button onClick={savePlan} disabled={planSaving}>
              {planSaving ? "שומר…" : "שמירה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New pass dialog */}
      <Dialog open={passOpen} onOpenChange={setPassOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>כרטיסייה חדשה</DialogTitle>
          </DialogHeader>
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
                    {c.full_name || "ללא שם"} ·{" "}
                    <span dir="ltr">{c.phone || emails[c.id] || "—"}</span>
                  </button>
                ))}
                {matchingClients.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">אין תוצאות</div>
                )}
              </div>
              {passForm.user_id && (
                <p className="text-xs text-forest/70 mt-1">
                  נבחרה: {clientLabel(passForm.user_id)}
                </p>
              )}
            </div>
            <div>
              <Label>תבנית חבילה (אופציונלי — ממלא אוטומטית)</Label>
              <Select value={passForm.plan_id} onValueChange={pickPlanForPass}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="בחר תבנית" />
                </SelectTrigger>
                <SelectContent>
                  {(plans.data ?? [])
                    .filter((p) => p.active)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {p.total_entries} כניסות · ₪{Number(p.price).toFixed(0)} ·{" "}
                        {p.validity_months} חודשים
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>שם החבילה (יוצג ללקוחה)</Label>
              <Input
                value={passForm.plan_name}
                onChange={(e) => setPassForm((f) => ({ ...f, plan_name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>מספר כניסות</Label>
                <Input
                  type="number"
                  min={1}
                  value={passForm.total_entries}
                  onChange={(e) =>
                    setPassForm((f) => ({ ...f, total_entries: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <Label>שולם בפועל (₪)</Label>
                <Input
                  type="number"
                  min={0}
                  value={passForm.price_paid}
                  onChange={(e) =>
                    setPassForm((f) => ({ ...f, price_paid: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <Label>תוקף (חודשים)</Label>
                <Input
                  type="number"
                  min={1}
                  value={passForm.validity_months}
                  onChange={(e) =>
                    setPassForm((f) => ({ ...f, validity_months: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={passForm.payment_received}
                onCheckedChange={(v) => setPassForm((f) => ({ ...f, payment_received: v }))}
              />
              <Label>התשלום התקבל</Label>
            </div>
            <div>
              <Label>הערות (אופציונלי)</Label>
              <Textarea
                rows={2}
                value={passForm.notes}
                onChange={(e) => setPassForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="לדוגמה: אסמכתא התקבלה במייל 23.8"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPassOpen(false)}>
              ביטול
            </Button>
            <Button onClick={savePass} disabled={passSaving}>
              {passSaving ? "שומר…" : "יצירת כרטיסייה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pass detail: redemption history + manual adjust + extend */}
      <Dialog open={!!detailPass} onOpenChange={(o) => !o && setDetailPassId(null)}>
        {detailPass && (
          <PassDetailContent
            pass={detailPass}
            clientLabel={clientLabel(detailPass.user_id)}
            onAdjust={adjustEntries}
            onChanged={() => qc.invalidateQueries({ queryKey: ["admin-subscription-passes"] })}
            onCancel={() => cancelPass(detailPass)}
          />
        )}
      </Dialog>
    </div>
  );
}

function PassDetailContent({
  pass,
  clientLabel,
  onAdjust,
  onChanged,
  onCancel,
}: {
  pass: Pass;
  clientLabel: string;
  onAdjust: ReturnType<typeof useServerFn<typeof adminAdjustSubscriptionPassEntries>>;
  onChanged: () => void;
  onCancel: () => void;
}) {
  const status = derivedStatus(pass);
  const [delta, setDelta] = useState(1);
  const [note, setNote] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [extraMonths, setExtraMonths] = useState(1);
  const [extending, setExtending] = useState(false);

  const history = useQuery({
    queryKey: ["admin-pass-history", pass.id],
    queryFn: async () => {
      const [bookingsRes, adjustmentsRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, session_date, start_time, end_time, status")
          .eq("subscription_pass_id", pass.id)
          .order("session_date", { ascending: false }),
        supabase
          .from("subscription_pass_adjustments" as never)
          .select("*")
          .eq("pass_id", pass.id)
          .order("created_at", { ascending: false }),
      ]);
      return {
        bookings: (bookingsRes.data ?? []) as BookingRow[],
        adjustments: (adjustmentsRes.data ?? []) as unknown as AdjustmentRow[],
      };
    },
  });

  const submitAdjust = async () => {
    if (!delta) return toast.error("יש לבחור שינוי שונה מאפס");
    if (!note.trim()) return toast.error("יש להוסיף הערה");
    setAdjusting(true);
    try {
      await onAdjust({ data: { pass_id: pass.id, delta, note: note.trim() } });
      toast.success("הכרטיסייה עודכנה");
      setNote("");
      setDelta(1);
      onChanged();
      history.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "העדכון נכשל");
    } finally {
      setAdjusting(false);
    }
  };

  const extendExpiry = async () => {
    if (!extraMonths) return;
    setExtending(true);
    const next = new Date(pass.expires_at);
    next.setMonth(next.getMonth() + extraMonths);
    const { error } = await supabase
      .from("subscription_passes" as never)
      .update({ expires_at: next.toISOString() } as never)
      .eq("id", pass.id);
    setExtending(false);
    if (error) return toast.error(heError(error.message));
    toast.success(`התוקף הוארך ב-${extraMonths} חודשים`);
    onChanged();
  };

  return (
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <IdCard className="h-5 w-5" /> {clientLabel} · {pass.plan_name}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-5">
        <div className="flex items-center justify-between text-sm bg-cream/50 rounded-xl p-3">
          <span>
            {pass.entries_used} / {pass.total_entries} כניסות נוצלו
          </span>
          <Badge
            variant={
              status === "active" ? "default" : status === "cancelled" ? "destructive" : "outline"
            }
          >
            {STATUS_LABELS[status]}
          </Badge>
        </div>
        <div className="text-xs text-forest/70 space-y-1">
          <div>נרכשה: {new Date(pass.purchased_at).toLocaleDateString("he-IL")}</div>
          <div>בתוקף עד: {new Date(pass.expires_at).toLocaleDateString("he-IL")}</div>
          <div>
            מקור: {pass.purchase_source === "online_card" ? "רכישה עצמית באשראי" : "נוצרה ידנית"}
          </div>
          {pass.notes && <div>הערות: {pass.notes}</div>}
        </div>

        <div>
          <div className="text-sm font-medium flex items-center gap-1.5 mb-2">
            <History className="h-4 w-4" /> היסטוריית ניצול
          </div>
          {history.isLoading ? (
            <p className="text-xs text-forest/60">טוען…</p>
          ) : (
            <div className="space-y-1 text-xs">
              {(history.data?.bookings ?? []).map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between bg-card border border-primary/5 rounded-lg px-3 py-1.5"
                >
                  <span>
                    {new Date(b.session_date).toLocaleDateString("he-IL")} ·{" "}
                    {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                  </span>
                  <span className="text-forest/60">
                    {b.status === "cancelled" ? "בוטל" : "נוצל"}
                  </span>
                </div>
              ))}
              {(history.data?.adjustments ?? []).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between bg-cream/40 border border-primary/5 rounded-lg px-3 py-1.5"
                >
                  <span>{a.note}</span>
                  <span className={a.delta > 0 ? "text-forest" : "text-destructive"}>
                    {a.delta > 0 ? `+${a.delta}` : a.delta}
                  </span>
                </div>
              ))}
              {(history.data?.bookings?.length ?? 0) === 0 &&
                (history.data?.adjustments?.length ?? 0) === 0 && (
                  <p className="text-forest/50 text-center py-2">אין עדיין ניצול</p>
                )}
            </div>
          )}
        </div>

        <div className="border-t border-primary/5 pt-4 space-y-2">
          <div className="text-sm font-medium">עדכון ידני של כניסות</div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={delta}
              onChange={(e) => setDelta(Number(e.target.value))}
              className="w-20"
            />
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="סיבת העדכון (חובה)"
              className="flex-1"
            />
            <Button size="sm" onClick={submitAdjust} disabled={adjusting}>
              {adjusting ? "מעדכן…" : "עדכן"}
            </Button>
          </div>
        </div>

        <div className="border-t border-primary/5 pt-4 space-y-2">
          <div className="text-sm font-medium flex items-center gap-1.5">
            <CalendarClock className="h-4 w-4" /> הארכת תוקף
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={extraMonths}
              onChange={(e) => setExtraMonths(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-sm text-forest/70">חודשים נוספים</span>
            <Button size="sm" variant="outline" onClick={extendExpiry} disabled={extending}>
              {extending ? "מעדכן…" : "הארך"}
            </Button>
          </div>
        </div>
      </div>
      <DialogFooter>
        {status !== "cancelled" && (
          <Button variant="destructive" className="gap-1.5" onClick={onCancel}>
            <X className="h-4 w-4" /> ביטול כרטיסייה
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

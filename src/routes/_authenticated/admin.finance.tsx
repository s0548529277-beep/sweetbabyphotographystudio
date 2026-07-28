import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Trash2, TrendingUp, TrendingDown, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/finance")({
  component: FinanceAdmin,
});

const CATEGORIES = ["ציוד", "אביזרים", "שכירות", "פרסום", "משלוחים", "אחר"];

const monthKey = (d: string) => d.slice(0, 7);
const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const monthLabel = (k: string) => {
  const [y, m] = k.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
};

function FinanceAdmin() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", amount: "", category: "אחר", spent_on: new Date().toISOString().slice(0, 10) });

  const data = useQuery({
    queryKey: ["admin-finance"],
    queryFn: async () => {
      const [ordersRes, bookingsRes, expensesRes] = await Promise.all([
        supabase.from("orders").select("id,total,status,created_at,scheduled_date"),
        supabase.from("bookings").select("id,price,status,created_at,session_date"),
        supabase.from("expenses").select("*").order("spent_on", { ascending: false }),
      ]);
      if (expensesRes.error) throw expensesRes.error;
      return {
        orders: ordersRes.data ?? [],
        bookings: bookingsRes.data ?? [],
        expenses: expensesRes.data ?? [],
      };
    },
  });

  const months = useMemo(() => {
    const map = new Map<string, { key: string; orders: number; bookings: number; expenses: number }>();
    const get = (k: string) => {
      if (!map.has(k)) map.set(k, { key: k, orders: 0, bookings: 0, expenses: 0 });
      return map.get(k)!;
    };
    for (const o of data.data?.orders ?? []) {
      if (o.status === "cancelled") continue;
      get(monthKey((o.scheduled_date ?? o.created_at) as string)).orders += Number(o.total ?? 0);
    }
    for (const b of data.data?.bookings ?? []) {
      if (b.status === "cancelled") continue;
      get(monthKey((b.session_date ?? b.created_at) as string)).bookings += Number(b.price ?? 0);
    }
    for (const e of data.data?.expenses ?? []) {
      get(monthKey(e.spent_on as string)).expenses += Number(e.amount ?? 0);
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [data.data]);

  const totals = useMemo(
    () =>
      months.reduce(
        (acc, m) => ({
          income: acc.income + m.orders + m.bookings,
          expenses: acc.expenses + m.expenses,
        }),
        { income: 0, expenses: 0 },
      ),
    [months],
  );

  const maxBar = Math.max(1, ...months.map((m) => Math.max(m.orders + m.bookings, m.expenses)));

  const addExpense = async () => {
    const amount = Number(form.amount);
    if (!form.title.trim() || !amount) return toast.error("נא למלא תיאור וסכום");
    const { error } = await supabase.from("expenses").insert({
      title: form.title.trim(),
      amount,
      category: form.category,
      spent_on: form.spent_on,
    });
    if (error) return toast.error(error.message);
    toast.success("ההוצאה נוספה");
    setForm({ ...form, title: "", amount: "" });
    qc.invalidateQueries({ queryKey: ["admin-finance"] });
  };

  const removeExpense = async (id: string) => {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-finance"] });
  };

  return (
    <div className="space-y-8" dir="rtl">
      <div>
        <h2 className="font-display text-2xl text-primary mb-1">הכנסות והוצאות</h2>
        <p className="text-sm text-muted-foreground">סיכום חודשי של הכנסות מהזמנות ומהשכרות סטודיו, מול הוצאות שנרשמו.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { label: "סה״כ הכנסות", value: totals.income, icon: TrendingUp, cls: "text-forest" },
          { label: "סה״כ הוצאות", value: totals.expenses, icon: TrendingDown, cls: "text-destructive" },
          { label: "רווח נקי", value: totals.income - totals.expenses, icon: Wallet, cls: "text-primary" },
        ].map((c) => (
          <div key={c.label} className="bg-card rounded-2xl border border-primary/5 p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <c.icon className="h-4 w-4" /> {c.label}
            </div>
            <div className={`font-display text-3xl ${c.cls}`}>{ils(c.value)}</div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <h3 className="font-display text-lg mb-4">פירוט לפי חודשים</h3>
        {data.isLoading ? (
          <p className="text-sm text-muted-foreground">טוען…</p>
        ) : months.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין נתונים עדיין.</p>
        ) : (
          <div className="space-y-4">
            {months.map((m) => {
              const income = m.orders + m.bookings;
              const net = income - m.expenses;
              return (
                <div key={m.key} className="rounded-xl bg-cream/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="font-medium">{monthLabel(m.key)}</div>
                    <div className="text-sm flex gap-4">
                      <span className="text-forest">הכנסות {ils(income)}</span>
                      <span className="text-destructive">הוצאות {ils(m.expenses)}</span>
                      <span className={net >= 0 ? "text-primary" : "text-destructive"}>נטו {ils(net)}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2.5 rounded-full bg-forest/15 overflow-hidden">
                      <div className="h-full bg-forest rounded-full" style={{ width: `${(income / maxBar) * 100}%` }} />
                    </div>
                    <div className="h-2.5 rounded-full bg-destructive/10 overflow-hidden">
                      <div className="h-full bg-destructive rounded-full" style={{ width: `${(m.expenses / maxBar) * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    השכרת אביזרים {ils(m.orders)} · השכרת סטודיו {ils(m.bookings)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <h3 className="font-display text-lg mb-4">רישום הוצאה</h3>
        <div className="grid sm:grid-cols-5 gap-3">
          <Input placeholder="תיאור" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="sm:col-span-2" />
          <Input type="number" placeholder="סכום" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <Input type="date" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} />
        </div>
        <Button className="mt-3" onClick={addExpense}>
          הוסף הוצאה
        </Button>

        <div className="mt-6 divide-y divide-primary/5">
          {(data.data?.expenses ?? []).map((e: any) => (
            <div key={e.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <div className="font-medium">{e.title}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(e.spent_on).toLocaleDateString("he-IL")} · {e.category}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-destructive">{ils(Number(e.amount))}</span>
                <Button variant="ghost" size="icon" onClick={() => removeExpense(e.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Trash2, TrendingUp, TrendingDown, Wallet, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/finance")({
  component: FinanceAdmin,
});

const TYPE_PROPS = "השכרת אביזרים";
const TYPE_STUDIO = "השכרת סטודיו";
const TYPE_PHOTO = "צילומים בסטודיו";
const INCOME_CATEGORIES = [TYPE_PHOTO, TYPE_STUDIO, TYPE_PROPS, "מכירה", "אחר"];
const CATEGORIES = ["ציוד", "אביזרים", "שכירות", "פרסום", "משלוחים", "אחר"];

const monthKey = (d: string) => d.slice(0, 7);
const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const monthLabel = (k: string) => {
  const [y, m] = k.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
};

type Txn = {
  id: string;
  kind: "income" | "expense";
  type: string;
  title: string;
  client: string;
  date: string;
  amount: number;
  removable: null | "manual_income" | "expenses";
};

function FinanceAdmin() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", amount: "", category: "אחר", spent_on: new Date().toISOString().slice(0, 10) });
  const [income, setIncome] = useState({ title: "", amount: "", client: "", category: TYPE_PHOTO, received_on: new Date().toISOString().slice(0, 10) });

  // Filters
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [client, setClient] = useState("");
  const [type, setType] = useState("all");

  const data = useQuery({
    queryKey: ["admin-finance"],
    queryFn: async () => {
      const [ordersRes, bookingsRes, expensesRes, manualRes] = await Promise.all([
        supabase.from("orders").select("id,total,status,created_at,scheduled_date,contact_name"),
        supabase.from("bookings").select("id,price,status,created_at,session_date,contact_name,package"),
        supabase.from("expenses").select("*").order("spent_on", { ascending: false }),
        supabase.from("manual_income").select("*").order("received_on", { ascending: false }),
      ]);
      if (expensesRes.error) throw expensesRes.error;
      return {
        orders: ordersRes.data ?? [],
        bookings: bookingsRes.data ?? [],
        expenses: expensesRes.data ?? [],
        manual: manualRes.data ?? [],
      };
    },
  });

  /** Every income/expense line, normalised so it can be filtered and grouped. */
  const allTxns = useMemo<Txn[]>(() => {
    const out: Txn[] = [];
    for (const o of data.data?.orders ?? []) {
      if (o.status === "cancelled") continue;
      out.push({
        id: `o-${o.id}`, kind: "income", type: TYPE_PROPS,
        title: `הזמנת אביזרים #${String(o.id).slice(0, 8)}`,
        client: o.contact_name ?? "",
        date: String(o.scheduled_date ?? o.created_at).slice(0, 10),
        amount: Number(o.total ?? 0), removable: null,
      });
    }
    for (const b of data.data?.bookings ?? []) {
      if (b.status === "cancelled") continue;
      const isPhoto = b.package === "photography";
      out.push({
        id: `b-${b.id}`, kind: "income", type: isPhoto ? TYPE_PHOTO : TYPE_STUDIO,
        title: isPhoto ? "סשן צילומים עם מיכל" : "שריון סטודיו",
        client: b.contact_name ?? "",
        date: String(b.session_date ?? b.created_at).slice(0, 10),
        amount: Number(b.price ?? 0), removable: null,
      });
    }
    for (const mi of data.data?.manual ?? []) {
      out.push({
        id: `m-${mi.id}`, kind: "income", type: mi.category ?? "אחר",
        title: mi.title, client: (mi.notes as string) ?? "",
        date: String(mi.received_on).slice(0, 10),
        amount: Number(mi.amount ?? 0), removable: "manual_income",
      });
    }
    for (const e of data.data?.expenses ?? []) {
      out.push({
        id: `e-${e.id}`, kind: "expense", type: e.category ?? "אחר",
        title: e.title, client: (e.notes as string) ?? "",
        date: String(e.spent_on).slice(0, 10),
        amount: Number(e.amount ?? 0), removable: "expenses",
      });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [data.data]);

  const txns = useMemo(() => {
    const c = client.trim().toLowerCase();
    return allTxns.filter((t) => {
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (type !== "all" && t.type !== type) return false;
      if (c && !(`${t.client} ${t.title}`.toLowerCase().includes(c))) return false;
      return true;
    });
  }, [allTxns, from, to, client, type]);

  const months = useMemo(() => {
    const map = new Map<string, { key: string; props: number; studio: number; photo: number; manual: number; expenses: number }>();
    const get = (k: string) => {
      if (!map.has(k)) map.set(k, { key: k, props: 0, studio: 0, photo: 0, manual: 0, expenses: 0 });
      return map.get(k)!;
    };
    for (const t of txns) {
      const m = get(monthKey(t.date));
      if (t.kind === "expense") m.expenses += t.amount;
      else if (t.type === TYPE_PROPS) m.props += t.amount;
      else if (t.type === TYPE_STUDIO) m.studio += t.amount;
      else if (t.type === TYPE_PHOTO) m.photo += t.amount;
      else m.manual += t.amount;
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [txns]);

  const totals = useMemo(
    () =>
      txns.reduce(
        (acc, t) => ({
          income: acc.income + (t.kind === "income" ? t.amount : 0),
          expenses: acc.expenses + (t.kind === "expense" ? t.amount : 0),
        }),
        { income: 0, expenses: 0 },
      ),
    [txns],
  );

  const maxBar = Math.max(1, ...months.map((m) => Math.max(m.props + m.studio + m.photo + m.manual, m.expenses)));

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

  const addIncome = async () => {
    const amount = Number(income.amount);
    if (!income.title.trim() || !amount) return toast.error("נא למלא תיאור וסכום");
    const { error } = await supabase.from("manual_income").insert({
      title: income.title.trim(),
      amount,
      category: income.category,
      notes: income.client.trim() || null,
      received_on: income.received_on,
    });
    if (error) return toast.error(error.message);
    toast.success("ההכנסה נוספה");
    setIncome({ ...income, title: "", amount: "", client: "" });
    qc.invalidateQueries({ queryKey: ["admin-finance"] });
  };

  const removeTxn = async (t: Txn) => {
    if (!t.removable) return;
    const realId = t.id.slice(2);
    const { error } = await supabase.from(t.removable).delete().eq("id", realId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-finance"] });
  };

  return (
    <div className="space-y-8" dir="rtl">
      <div>
        <h2 className="font-display text-2xl text-primary mb-1">הכנסות והוצאות</h2>
        <p className="text-sm text-muted-foreground">
          כל התנועות במקום אחד — השכרת אביזרים, השכרת סטודיו, צילומים בסטודיו, הכנסות ידניות והוצאות.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <div className="flex items-center gap-2 text-sm font-medium mb-3">
          <Search className="h-4 w-4" /> סינון וחיפוש
        </div>
        <div className="grid sm:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">מתאריך</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">עד תאריך</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">חיפוש לפי לקוח / תיאור</label>
            <Input placeholder="שם לקוח…" value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">סוג</label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="all">הכל</option>
              {[TYPE_PROPS, TYPE_STUDIO, TYPE_PHOTO, "מכירה", "אחר", ...CATEGORIES].filter((v, i, a) => a.indexOf(v) === i).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        {(from || to || client || type !== "all") && (
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => { setFrom(""); setTo(""); setClient(""); setType("all"); }}>
            ניקוי סינון
          </Button>
        )}
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
          <p className="text-sm text-muted-foreground">אין נתונים לסינון הנוכחי.</p>
        ) : (
          <div className="space-y-4">
            {months.map((m) => {
              const inc = m.props + m.studio + m.photo + m.manual;
              const net = inc - m.expenses;
              return (
                <div key={m.key} className="rounded-xl bg-cream/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="font-medium">{monthLabel(m.key)}</div>
                    <div className="text-sm flex gap-4">
                      <span className="text-forest">הכנסות {ils(inc)}</span>
                      <span className="text-destructive">הוצאות {ils(m.expenses)}</span>
                      <span className={net >= 0 ? "text-primary" : "text-destructive"}>נטו {ils(net)}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2.5 rounded-full bg-forest/15 overflow-hidden">
                      <div className="h-full bg-forest rounded-full" style={{ width: `${(inc / maxBar) * 100}%` }} />
                    </div>
                    <div className="h-2.5 rounded-full bg-destructive/10 overflow-hidden">
                      <div className="h-full bg-destructive rounded-full" style={{ width: `${(m.expenses / maxBar) * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {TYPE_PROPS} {ils(m.props)} · {TYPE_STUDIO} {ils(m.studio)} · {TYPE_PHOTO} {ils(m.photo)} · ידני {ils(m.manual)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Transactions */}
      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <h3 className="font-display text-lg mb-4">תנועות ({txns.length})</h3>
        <div className="divide-y divide-primary/5 max-h-[520px] overflow-auto">
          {txns.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {t.title}
                  {t.client ? <span className="text-muted-foreground"> · {t.client}</span> : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(t.date).toLocaleDateString("he-IL")} · {t.type}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={t.kind === "income" ? "text-forest" : "text-destructive"}>
                  {t.kind === "income" ? "+" : "−"}
                  {ils(t.amount)}
                </span>
                {t.removable && (
                  <Button variant="ghost" size="icon" onClick={() => removeTxn(t)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {txns.length === 0 && <p className="text-sm text-muted-foreground py-4">לא נמצאו תנועות.</p>}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-primary/5 p-5">
        <h3 className="font-display text-lg mb-4">רישום הכנסה ידנית</h3>
        <div className="grid sm:grid-cols-5 gap-3">
          <Input placeholder="תיאור (למשל: סשן צילומים)" value={income.title} onChange={(e) => setIncome({ ...income, title: e.target.value })} className="sm:col-span-2" />
          <Input placeholder="שם לקוח" value={income.client} onChange={(e) => setIncome({ ...income, client: e.target.value })} />
          <Input type="number" placeholder="סכום" value={income.amount} onChange={(e) => setIncome({ ...income, amount: e.target.value })} />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={income.category}
            onChange={(e) => setIncome({ ...income, category: e.target.value })}
          >
            {INCOME_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <Input type="date" value={income.received_on} onChange={(e) => setIncome({ ...income, received_on: e.target.value })} className="sm:col-span-1" />
        </div>
        <Button className="mt-3" onClick={addIncome}>
          הוסף הכנסה
        </Button>
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
      </div>
    </div>
  );
}

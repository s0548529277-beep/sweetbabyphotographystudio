import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Mail, Pencil, Plus, Search, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { heError } from "@/lib/he-errors";
import {
  balanceOf,
  formatDateIL,
  shekel,
  ymd,
  type CmPaymentAccount,
} from "@/lib/client-management";
import { sendCmPaymentEmail } from "@/lib/client-management.functions";
import { cmDb, useCmInvalidate, type CmData } from "./data";
import { EmptyState, Panel, StatCard } from "./ui";

type AccForm = {
  id?: string;
  client_id: string;
  session_id: string;
  title: string;
  total: string;
  paid: string;
  due: string;
  notes: string;
  sendEmail: boolean;
};

export function PaymentDialog({
  data,
  open,
  onOpenChange,
  initial,
}: {
  data: CmData;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: Partial<AccForm>;
}) {
  const invalidate = useCmInvalidate();
  const sendEmail = useServerFn(sendCmPaymentEmail);
  const [form, setForm] = useState<AccForm>(() => blank(initial, data));
  const [saving, setSaving] = useState(false);
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setForm(blank(initial, data));
  }
  const set = (p: Partial<AccForm>) => setForm((f) => ({ ...f, ...p }));
  const clientSessions = data.sessions.filter((s) => s.client_id === form.client_id);

  const save = async () => {
    if (!form.client_id) return toast.error("בחרי לקוחה");
    const total = Number(form.total || 0);
    const paid = Number(form.paid || 0);
    if (total <= 0) return toast.error("הסכום צריך להיות גדול מאפס");
    setSaving(true);
    try {
      const payload = {
        client_id: form.client_id,
        session_id: form.session_id || null,
        title: form.title.trim() || "צילום",
        total_amount: total,
        paid_amount: Math.min(paid, total),
        due_date: form.due || null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      let id = form.id;
      if (form.id) {
        const { error } = await cmDb.from("cm_payment_accounts").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { data: row, error } = await cmDb
          .from("cm_payment_accounts")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        id = row.id;
      }
      if (form.sendEmail && id) {
        try {
          await sendEmail({ data: { accountId: id, kind: form.id ? "updated" : "opened" } });
          toast.success("נשמר ונשלח מייל סיכום");
        } catch (e) {
          toast.error(`נשמר, אבל המייל לא נשלח: ${heError(e)}`);
        }
      } else toast.success("נשמר");
      invalidate("accounts");
      onOpenChange(false);
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{form.id ? "עריכת חשבון" : "חשבון לקוחה חדש"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>לקוחה</Label>
            <Select
              value={form.client_id}
              onValueChange={(v) => set({ client_id: v, session_id: "" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="בחירת לקוחה" />
              </SelectTrigger>
              <SelectContent>
                {data.clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {clientSessions.length > 0 && (
            <div>
              <Label>שיוך לצילום</Label>
              <Select
                value={form.session_id || "none"}
                onValueChange={(v) => {
                  const s = clientSessions.find((x) => x.id === v);
                  set({
                    session_id: v === "none" ? "" : v,
                    title:
                      s && !form.title
                        ? `צילום ${s.session_type} · ${formatDateIL(s.session_date)}`
                        : form.title,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ללא</SelectItem>
                  {clientSessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.session_type} · {formatDateIL(s.session_date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>עבור</Label>
            <Input
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="צילום ניו בורן, אלבום, הדפסות…"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>סה״כ (₪)</Label>
              <Input
                type="number"
                min={0}
                value={form.total}
                onChange={(e) => set({ total: e.target.value })}
              />
            </div>
            <div>
              <Label>שולם (₪)</Label>
              <Input
                type="number"
                min={0}
                value={form.paid}
                onChange={(e) => set({ paid: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>לתשלום עד (לא חובה)</Label>
            <Input type="date" value={form.due} onChange={(e) => set({ due: e.target.value })} />
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.sendEmail} onCheckedChange={(v) => set({ sendEmail: !!v })} />
            לשלוח ללקוחה מייל סיכום (ועותק אלייך)
          </label>
        </div>
        <DialogFooter>
          <Button
            onClick={save}
            disabled={saving}
            className="rounded-full bg-newborn-rose text-white hover:bg-newborn-rose/90"
          >
            {saving ? "שומרת…" : "שמירה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function blank(initial: Partial<AccForm> | undefined, data: CmData): AccForm {
  return {
    client_id: "",
    session_id: "",
    title: "",
    total: "",
    paid: "0",
    due: "",
    notes: "",
    sendEmail: initial?.id ? data.settings.paymentEmailOnUpdate : data.settings.paymentEmailOnOpen,
    ...initial,
  };
}

export function accountToForm(a: CmPaymentAccount): Partial<AccForm> {
  return {
    id: a.id,
    client_id: a.client_id,
    session_id: a.session_id ?? "",
    title: a.title,
    total: String(a.total_amount),
    paid: String(a.paid_amount),
    due: a.due_date ?? "",
    notes: a.notes ?? "",
  };
}

export function AccountRow({
  a,
  data,
  onEdit,
}: {
  a: CmPaymentAccount;
  data: CmData;
  onEdit: (a: CmPaymentAccount) => void;
}) {
  const invalidate = useCmInvalidate();
  const sendEmail = useServerFn(sendCmPaymentEmail);
  const [payAmount, setPayAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const client = data.clientById.get(a.client_id);
  const balance = balanceOf(a);
  const pct =
    a.total_amount > 0 ? Math.min(100, Math.round((a.paid_amount / a.total_amount) * 100)) : 0;
  const overdue = balance > 0 && a.due_date && a.due_date < ymd(new Date());

  const recordPayment = async (amount: number) => {
    if (!(amount > 0)) return toast.error("הקלידי סכום");
    setBusy(true);
    try {
      const paid = Math.min(a.total_amount, a.paid_amount + amount);
      const { error } = await cmDb
        .from("cm_payment_accounts")
        .update({ paid_amount: paid, updated_at: new Date().toISOString() })
        .eq("id", a.id);
      if (error) throw error;
      setPayAmount("");
      if (data.settings.paymentEmailOnUpdate && client?.email) {
        sendEmail({ data: { accountId: a.id, kind: "updated" } }).catch(() =>
          toast.error("התשלום נרשם, אבל המייל לא נשלח"),
        );
        toast.success("התשלום נרשם ונשלח עדכון ללקוחה");
      } else toast.success("התשלום נרשם");
      invalidate("accounts");
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`למחוק את החשבון "${a.title}" של ${client?.full_name ?? ""}?`)) return;
    const { error } = await cmDb.from("cm_payment_accounts").delete().eq("id", a.id);
    if (error) return toast.error(heError(error));
    invalidate("accounts");
  };

  const resend = async () => {
    setBusy(true);
    try {
      await sendEmail({ data: { accountId: a.id, kind: "updated" } });
      toast.success("נשלח מייל סיכום");
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-newborn-rose/10 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-newborn-ink">{client?.full_name ?? "—"}</div>
          <div className="text-xs text-newborn-ink/55">
            {a.title}
            {a.due_date && (
              <span className={overdue ? "font-medium text-destructive" : ""}>
                {" "}
                · עד {formatDateIL(a.due_date)}
              </span>
            )}
          </div>
        </div>
        <div className="text-left">
          <div
            className={`text-lg font-semibold tabular-nums ${balance > 0 ? "text-newborn-rose" : "text-emerald-700"}`}
          >
            {balance > 0 ? `${shekel(balance)} פתוח` : "שולם במלואו"}
          </div>
          <div className="text-xs text-newborn-ink/50">
            {shekel(a.paid_amount)} מתוך {shekel(a.total_amount)}
          </div>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-newborn-blush/50">
        <div
          className="h-full rounded-full bg-gradient-to-l from-newborn-rose to-newborn-gold"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {balance > 0 && (
          <>
            <Input
              type="number"
              min={0}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="סכום ששולם"
              className="h-8 w-28 rounded-full text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-full"
              disabled={busy}
              onClick={() => recordPayment(Number(payAmount))}
            >
              <Plus className="h-3.5 w-3.5" /> רישום תשלום
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-full text-emerald-700"
              disabled={busy}
              onClick={() => recordPayment(balance)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> שולם הכל
            </Button>
          </>
        )}
        <div className="ms-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            title="שליחת סיכום במייל"
            disabled={busy}
            onClick={resend}
          >
            <Mail className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" title="עריכה" onClick={() => onEdit(a)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" title="מחיקה" onClick={remove}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PaymentsTab({ data }: { data: CmData }) {
  const [filter, setFilter] = useState<"all" | "open" | "paid">("all");
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initial, setInitial] = useState<Partial<AccForm> | undefined>(undefined);

  const totals = useMemo(() => {
    const open = data.accounts.reduce((s, a) => s + balanceOf(a), 0);
    const paid = data.accounts.reduce((s, a) => s + a.paid_amount, 0);
    return { open, paid };
  }, [data.accounts]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.accounts
      .filter((a) =>
        filter === "open" ? balanceOf(a) > 0 : filter === "paid" ? balanceOf(a) === 0 : true,
      )
      .filter((a) => {
        if (!term) return true;
        const c = data.clientById.get(a.client_id);
        return [c?.full_name, c?.email, c?.phone, a.title, a.notes].some((v) =>
          (v ?? "").toLowerCase().includes(term),
        );
      })
      .sort((x, y) => balanceOf(y) - balanceOf(x));
  }, [data.accounts, data.clientById, filter, q]);

  const openNew = () => {
    setInitial({});
    setDialogOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="חשבונות לקוחות"
          value={data.accounts.length}
          tone="ink"
        />
        <StatCard
          icon={<span>💰</span>}
          label="יתרה פתוחה"
          value={shekel(totals.open)}
          tone="rose"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="שולם סה״כ"
          value={shekel(totals.paid)}
          tone="sage"
        />
      </div>
      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-newborn-rose/20 bg-newborn-canvas/50 p-1 text-sm">
            {(
              [
                ["all", "הכל"],
                ["open", "יתרה פתוחה"],
                ["paid", "שולם במלואו"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={`rounded-full px-3 py-1 ${filter === v ? "bg-newborn-rose text-white" : "text-newborn-ink/70"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-newborn-ink/40" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש שם / מייל / תאריך…"
              className="rounded-full pr-9"
            />
          </div>
          <Button
            onClick={openNew}
            className="rounded-full bg-newborn-rose text-white hover:bg-newborn-rose/90"
            disabled={!data.clients.length}
          >
            <Plus className="h-4 w-4" /> חשבון לקוחה חדש
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((a) => (
            <AccountRow
              key={a.id}
              a={a}
              data={data}
              onEdit={(acc) => {
                setInitial(accountToForm(acc));
                setDialogOpen(true);
              }}
            />
          ))}
        </div>
        {!list.length && (
          <EmptyState>
            {data.clients.length
              ? "אין חשבונות להצגה"
              : "קודם מוסיפים לקוחה, ואז אפשר לפתוח לה חשבון"}
          </EmptyState>
        )}
        <p className="mt-4 text-xs text-newborn-ink/50">
          💡 פתיחת חשבון ורישום תשלום שולחים ללקוחה מייל אוטומטי (עם עותק אלייך) — אפשר לכבות
          בהגדרות.
        </p>
      </Panel>
      <PaymentDialog data={data} open={dialogOpen} onOpenChange={setDialogOpen} initial={initial} />
    </div>
  );
}

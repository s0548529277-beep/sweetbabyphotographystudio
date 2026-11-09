import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, Mail, Wallet, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { heError } from "@/lib/he-errors";
import { formatDateIL } from "@/lib/client-management";
import { sendOutdoorPaymentReminderEmails, updateOutdoorOrderPayment } from "@/lib/outdoor-orders.functions";

/**
 * "טבלה" and "תשלומים" views for outdoor-shoot clients — the same two views the
 * newborn page has (added 2026-11-09 so outdoor has every option newborn has).
 */
export type OutdoorOrderRow = {
  id: string;
  package_name: string | null;
  total_price: number | null;
  amount_paid: number | null;
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
};

const paidOf = (o: OutdoorOrderRow) => Number(o.amount_paid ?? 0);
const totalOf = (o: OutdoorOrderRow) => Number(o.total_price ?? 0);

function YesNo({ yes }: { yes: boolean }) {
  return yes ? (
    <Check className="inline h-4 w-4 text-forest" />
  ) : (
    <XIcon className="inline h-4 w-4 text-destructive/70" />
  );
}

export function OutdoorTableView({ rows }: { rows: OutdoorOrderRow[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-primary/10 bg-card">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="border-b border-primary/10 text-right text-xs text-muted-foreground">
            <th className="px-3 py-3 font-medium">שם</th>
            <th className="px-3 py-3 font-medium">טלפון</th>
            <th className="px-3 py-3 font-medium">מייל</th>
            <th className="px-3 py-3 font-medium">תאריך ושעה</th>
            <th className="px-3 py-3 font-medium">חבילה</th>
            <th className="px-3 py-3 font-medium">ילדים</th>
            <th className="px-3 py-3 font-medium">שיחת סטיילינג</th>
            <th className="px-3 py-3 text-center font-medium">מקדמה</th>
            <th className="px-3 py-3 text-center font-medium">חוזה נשלח</th>
            <th className="px-3 py-3 font-medium">סכום</th>
            <th className="px-3 py-3 font-medium">שולם</th>
            <th className="px-3 py-3 font-medium">יתרה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const balance = Math.max(0, totalOf(o) - paidOf(o));
            return (
              <tr key={o.id} className="border-b border-primary/5 last:border-0 hover:bg-cream/40">
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-primary">{o.contact_name}</td>
                <td className="whitespace-nowrap px-3 py-2.5" dir="ltr">{o.contact_phone}</td>
                <td className="whitespace-nowrap px-3 py-2.5" dir="ltr">{o.contact_email || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {o.session_date ? (
                    <>
                      {formatDateIL(o.session_date)}
                      {o.session_time ? <span className="text-muted-foreground"> · {o.session_time.slice(0, 5)}</span> : null}
                    </>
                  ) : (
                    <span className="text-muted-foreground">טרם נקבע</span>
                  )}
                </td>
                <td className="px-3 py-2.5">{o.package_name ?? "—"}</td>
                <td className="px-3 py-2.5">
                  {o.children_count != null ? `${o.children_count}${o.children_names ? ` · ${o.children_names}` : ""}` : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">{o.styling_call_date ? formatDateIL(o.styling_call_date) : "—"}</td>
                <td className="px-3 py-2.5 text-center"><YesNo yes={o.deposit_paid} /></td>
                <td className="px-3 py-2.5 text-center"><YesNo yes={!!o.contract_sent_at} /></td>
                <td className="px-3 py-2.5 tabular-nums">{totalOf(o) > 0 ? `₪${totalOf(o)}` : "—"}</td>
                <td className="px-3 py-2.5 tabular-nums">₪{paidOf(o)}</td>
                <td className={`px-3 py-2.5 tabular-nums ${balance > 0 ? "font-semibold text-destructive" : "text-forest"}`}>
                  {totalOf(o) > 0 ? (balance > 0 ? `₪${balance}` : "שולם") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">אין לקוחות להצגה.</p>}
    </div>
  );
}

function StatBox({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-primary/10 bg-card p-4">
      <Wallet className={`h-5 w-5 ${warn ? "text-destructive" : "text-forest"}`} />
      <div>
        <div className={`font-display text-xl ${warn ? "text-destructive" : "text-primary"}`}>{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export function OutdoorPaymentsView({ rows, onSaved }: { rows: OutdoorOrderRow[]; onSaved: () => void }) {
  const runUpdatePayment = useServerFn(updateOutdoorOrderPayment);
  const sendReminders = useServerFn(sendOutdoorPaymentReminderEmails);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const paidTotal = rows.reduce((s, o) => s + paidOf(o), 0);
  const openTotal = rows.reduce((s, o) => s + Math.max(0, totalOf(o) - paidOf(o)), 0);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const sendToSelected = async () => {
    if (selected.size === 0) return toast.error("צריך לבחור לפחות לקוחה אחת");
    setSending(true);
    try {
      const { results } = await sendReminders({ data: { orderIds: Array.from(selected) } });
      const sent = results.filter((r) => r.sent).length;
      const skipped = results.filter((r) => !r.sent);
      if (sent > 0) toast.success(`נשלחו ${sent} מיילים`);
      if (skipped.length > 0) {
        toast.error(`${skipped.length} לא נשלחו: ${skipped.map((s) => s.reason).join(", ")}`, { duration: 8000 });
      }
      setSelected(new Set());
    } catch (e) {
      toast.error(heError(e, "השליחה נכשלה"));
    } finally {
      setSending(false);
    }
  };

  const save = async (o: OutdoorOrderRow) => {
    const raw = drafts[o.id];
    const amount = raw === undefined ? paidOf(o) : Number(raw);
    if (Number.isNaN(amount) || amount < 0) return toast.error("סכום לא תקין");
    setSavingId(o.id);
    try {
      await runUpdatePayment({ data: { id: o.id, amount_paid: totalOf(o) > 0 ? Math.min(amount, totalOf(o)) : amount } });
      setDrafts((d) => {
        const next = { ...d };
        delete next[o.id];
        return next;
      });
      onSaved();
    } catch (e) {
      toast.error(heError(e, "השמירה נכשלה"));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mt-3 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatBox value={`₪${paidTotal.toFixed(0)}`} label="שולם סה״כ" />
        <StatBox value={`₪${openTotal.toFixed(0)}`} label="יתרה פתוחה סה״כ" warn={openTotal > 0} />
      </div>

      <div className="flex items-center justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5 rounded-full"
          disabled={sending || selected.size === 0}
          onClick={sendToSelected}
        >
          <Mail className="h-3.5 w-3.5" /> {sending ? "שולח..." : `מייל תשלום ללקוחות (${selected.size})`}
        </Button>
      </div>

      <div className="space-y-3">
        {rows.map((o) => {
          const total = totalOf(o);
          const shown = drafts[o.id] ?? String(paidOf(o));
          const pct = total > 0 ? Math.min(100, (paidOf(o) / total) * 100) : 0;
          const balance = Math.max(0, total - paidOf(o));
          const paidInFull = total > 0 && balance <= 0;
          return (
            <div key={o.id} className="rounded-2xl border border-primary/10 bg-card p-4">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggle(o.id)} disabled={paidInFull || total <= 0} />
                <span className="font-medium text-primary">{o.contact_name}</span>
                {o.package_name && <span className="text-xs text-muted-foreground">{o.package_name}</span>}
                <span className="mr-auto text-sm text-muted-foreground">
                  {total > 0 ? (
                    <>
                      מתוך <span className="font-display text-primary">₪{total}</span>
                    </>
                  ) : (
                    "לא הוגדר סכום"
                  )}
                </span>
              </div>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={total > 0 ? total : undefined}
                  value={shown}
                  onChange={(e) => setDrafts((d) => ({ ...d, [o.id]: e.target.value }))}
                  className="h-9 max-w-[120px]"
                  dir="ltr"
                />
                <Button size="sm" onClick={() => save(o)} disabled={savingId === o.id} className="h-9 rounded-full">
                  {savingId === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "שמירה"}
                </Button>
                <span className={`mr-auto text-xs ${balance > 0 ? "text-destructive" : "text-forest"}`}>
                  {total <= 0 ? "" : balance > 0 ? `יתרה ₪${balance}` : "שולם במלואו"}
                </span>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">אין לקוחות להצגה.</p>}
      </div>
    </div>
  );
}

/** CSV (Excel-friendly, UTF-8 BOM) of outdoor orders — same idea as the newborn page's "ייצוא לאקסל". */
export function exportOutdoorCsv(rows: OutdoorOrderRow[]) {
  const header = ["שם", "טלפון", "מייל", "חבילה", "תאריך צילום", "שעה", "ילדים", "שיחת סטיילינג", "מקדמה", "סה״כ", "שולם", "יתרה", "הערות"];
  const lines = rows.map((o) => [
    o.contact_name,
    o.contact_phone,
    o.contact_email ?? "",
    o.package_name ?? "",
    o.session_date ?? "",
    o.session_time?.slice(0, 5) ?? "",
    o.children_count != null ? `${o.children_count}${o.children_names ? ` · ${o.children_names}` : ""}` : "",
    o.styling_call_date ?? "",
    o.deposit_paid ? "כן" : "לא",
    String(totalOf(o)),
    String(paidOf(o)),
    String(Math.max(0, totalOf(o) - paidOf(o))),
    o.notes ?? "",
  ]);
  const csv =
    "﻿" + [header, ...lines].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "לקוחות-צילומי-חוץ.csv";
  a.click();
  URL.revokeObjectURL(url);
}

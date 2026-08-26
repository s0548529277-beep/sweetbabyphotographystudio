import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { adminDeleteRecord, adminSetStatus, PHOTO_WORKFLOW_LINKED_PREFIX } from "@/lib/admin-orders.functions";
import { heError } from "@/lib/he-errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import { ChevronDown, ChevronUp, Camera, Package, RefreshCw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  component: OrdersAdmin,
});

const ORDER_STATUS = [
  { v: "pending", l: "ממתין לאישור" },
  { v: "confirmed", l: "אושר" },
  { v: "active", l: "בהשכרה" },
  { v: "returned", l: "הוחזר" },
  { v: "cancelled", l: "בוטל" },
];

const BOOKING_STATUS = [
  { v: "pending", l: "ממתין לאישור" },
  { v: "confirmed", l: "אושר" },
  { v: "completed", l: "התקיים" },
  { v: "cancelled", l: "בוטל" },
];

type Row = {
  id: string;
  kind: "order" | "booking";
  created_at: string;
  name: string;
  phone: string;
  date: string | null;
  time?: string | null;
  total: number;
  status: string;
  raw: any;
};

function OrdersAdmin() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "booking" | "order">("all");

  const q = useQuery({
    queryKey: ["admin-all-orders"],
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Row[]> => {
      const [ordersRes, bookingsRes, profilesRes] = await Promise.all([
        supabase
          .from("orders")
          .select("*, order_items(*)")
          .order("created_at", { ascending: false }),
        supabase
          .from("bookings")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, phone"),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (bookingsRes.error) throw bookingsRes.error;

      const byUser = new Map<string, any>((profilesRes.data ?? []).map((p: any) => [p.id, p]));


      const orders: Row[] = (ordersRes.data ?? []).map((o: any) => ({
        id: o.id,
        kind: "order",
        created_at: o.created_at,
        name: o.contact_name || byUser.get(o.user_id)?.full_name || "—",
        phone: o.contact_phone || byUser.get(o.user_id)?.phone || "—",
        date: o.session_date ?? o.scheduled_date ?? null,
        total: Number(o.total ?? 0),
        status: o.status,
        raw: o,
      }));
      const bookings: Row[] = (bookingsRes.data ?? []).map((b: any) => ({
        id: b.id,
        kind: "booking",
        created_at: b.created_at,
        name: b.contact_name || byUser.get(b.user_id)?.full_name || "—",
        phone: b.contact_phone || byUser.get(b.user_id)?.phone || "—",
        date: b.session_date,
        time: b.start_time ? `${b.start_time}–${b.end_time}` : null,
        total: Number(b.price ?? 0),
        status: b.status,
        raw: b,
      }));
      return [...bookings, ...orders].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });

  const rows = (q.data ?? []).filter((r) => tab === "all" || r.kind === tab);

  const doSetStatus = useServerFn(adminSetStatus);
  const setStatus = async (row: Row, status: string) => {
    try {
      await doSetStatus({ data: { kind: row.kind, id: row.id, status } });
      toast.success("סטטוס עודכן");
      qc.invalidateQueries({ queryKey: ["admin-all-orders"] });
      qc.invalidateQueries({ queryKey: ["calendar-entries"] });
    } catch (e) {
      toast.error(heError(e, "עדכון הסטטוס נכשל"));
    }
  };

  const doDelete = useServerFn(adminDeleteRecord);
  const deleteRow = async (row: Row, force = false) => {
    if (!force && !confirm(`למחוק לצמיתות את ${row.kind === "booking" ? "השריון" : "ההזמנה"} של ${row.name}?`)) return;
    try {
      await doDelete({ data: { kind: row.kind, id: row.id, force } });
      toast.success("נמחק");
      qc.invalidateQueries({ queryKey: ["admin-all-orders"] });
    } catch (e: any) {
      const message = e?.message ?? "";
      if (message.includes(PHOTO_WORKFLOW_LINKED_PREFIX)) {
        const detail = message.slice(message.indexOf(PHOTO_WORKFLOW_LINKED_PREFIX) + PHOTO_WORKFLOW_LINKED_PREFIX.length);
        if (confirm(`${detail}\n\nלמחוק בכל זאת, כולל כל התמונות? זה לא ניתן לביטול.`)) {
          deleteRow(row, true);
        }
        return;
      }
      toast.error(heError(e, "המחיקה נכשלה"));
    }
  };

  const tabs = [
    { v: "all" as const, l: "הכל", icon: null },
    { v: "booking" as const, l: "השכרות סטודיו", icon: Camera },
    { v: "order" as const, l: "הזמנות אביזרים", icon: Package },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {tabs.map((t) => {
            const count = (q.data ?? []).filter((r) => t.v === "all" || r.kind === t.v).length;
            return (
              <Button
                key={t.v}
                size="sm"
                variant={tab === t.v ? "default" : "outline"}
                className="rounded-full gap-2"
                onClick={() => setTab(t.v)}
              >
                {t.icon && <t.icon className="h-3.5 w-3.5" />} {t.l}
                <span className="opacity-70">({count})</span>
              </Button>
            );
          })}
        </div>
        <Button variant="ghost" size="sm" className="rounded-full gap-2" onClick={() => q.refetch()}>
          <RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} /> רענון
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-primary/5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream/60 text-right">
            <tr>
              <th className="p-3" />
              <th className="p-3 font-medium">סוג</th>
              <th className="p-3 font-medium">נוצר</th>
              <th className="p-3 font-medium">לקוח</th>
              <th className="p-3 font-medium">טלפון</th>
              <th className="p-3 font-medium">תאריך צילום</th>
              <th className="p-3 font-medium">סה״כ</th>
              <th className="p-3 font-medium">סטטוס</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const o = r.raw;
              const statusList = r.kind === "order" ? ORDER_STATUS : BOOKING_STATUS;
              const key = `${r.kind}-${r.id}`;
              return (
                <>
                  <tr key={key} className="border-t border-border">
                    <td className="p-2">
                      <Button size="icon" variant="ghost" onClick={() => setExpanded(expanded === key ? null : key)}>
                        {expanded === key ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className="gap-1 text-[11px]">
                        {r.kind === "booking" ? <Camera className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                        {r.kind === "booking" ? "סטודיו" : "אביזרים"}
                      </Badge>
                    </td>
                    <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("he-IL")}</td>
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3" dir="ltr">{r.phone}</td>
                    <td className="p-3 whitespace-nowrap">
                      {r.date ? new Date(r.date).toLocaleDateString("he-IL") : "—"}
                      {r.time && <span className="text-muted-foreground text-xs block" dir="ltr">{r.time}</span>}
                    </td>
                    <td className="p-3 font-display text-peach-deep">₪{r.total.toFixed(0)}</td>
                    <td className="p-3">
                      <Select value={r.status} onValueChange={(v) => setStatus(r, v)}>
                        <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {statusList.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      {r.status === "cancelled" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteRow(r)}
                          aria-label="מחיקה"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                  {expanded === key && (
                    <tr className="bg-cream/40">
                      <td colSpan={9} className="p-4">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">פריטים</div>
                            <ul className="text-sm space-y-1">
                              {r.kind === "order"
                                ? (o.order_items ?? []).map((oi: any) => (
                                    <li key={oi.id} className="flex justify-between">
                                      <span>{oi.item_name} <span className="text-muted-foreground">({oi.item_sku})</span> × {oi.quantity}</span>
                                      <span>₪{(oi.price * oi.quantity).toFixed(0)}</span>
                                    </li>
                                  ))
                                : (Array.isArray(o.reserved_items) ? o.reserved_items : []).map((ri: any, i: number) => (
                                    <li key={i}>{ri?.name ?? ri?.sku ?? String(ri)}</li>
                                  ))}
                              {((r.kind === "order" && !(o.order_items ?? []).length) ||
                                (r.kind === "booking" && !(Array.isArray(o.reserved_items) ? o.reserved_items : []).length)) && (
                                <li className="text-muted-foreground">אין אביזרים משוריינים</li>
                              )}
                            </ul>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">פרטים</div>
                            <div className="text-sm space-y-1">
                              {r.kind === "order" ? (
                                <div>החזרה: {o.return_date ? new Date(o.return_date).toLocaleDateString("he-IL") : "—"}</div>
                              ) : (
                                <>
                                  <div>חבילה: {o.package ?? "—"}</div>
                                  <div>שעות: <span dir="ltr">{o.start_time}–{o.end_time}</span></div>
                                </>
                              )}
                              <div>מקדמה: ₪{Number(o.deposit_amount ?? 0).toFixed(0)} ({o.deposit_status ?? "—"})</div>
                              {o.notes && <div>הערות: {o.notes}</div>}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="p-16 text-center text-muted-foreground">אין הזמנות עדיין.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

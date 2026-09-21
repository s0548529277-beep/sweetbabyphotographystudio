import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  adminApplyCoupon,
  adminDeleteRecord,
  adminSendPaymentRequest,
  adminSetPrice,
  adminSetStatus,
  adminUpdateOrderDetails,
  adminUpdateOrderItems,
  PHOTO_WORKFLOW_LINKED_PREFIX,
} from "@/lib/admin-orders.functions";
import { heError } from "@/lib/he-errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Camera,
  Package,
  RefreshCw,
  Trash2,
  Pencil,
  CreditCard,
  X,
} from "lucide-react";

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
        supabase.from("bookings").select("*").order("created_at", { ascending: false }),
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
  const todayKey = new Date().toISOString().slice(0, 10);

  const [editRow, setEditRow] = useState<Row | null>(null);
  const [sendingPaymentFor, setSendingPaymentFor] = useState<string | null>(null);

  const doSendPaymentRequest = useServerFn(adminSendPaymentRequest);
  const sendPaymentRequest = async (row: Row) => {
    if (!confirm(`לשלוח ל${row.name} מייל בקשת תשלום על סך ₪${row.total.toFixed(0)}?`)) return;
    setSendingPaymentFor(`${row.kind}-${row.id}`);
    try {
      await doSendPaymentRequest({ data: { kind: row.kind, id: row.id } });
      toast.success("מייל בקשת התשלום נשלח");
    } catch (e) {
      toast.error(heError(e, "שליחת בקשת התשלום נכשלה"));
    } finally {
      setSendingPaymentFor(null);
    }
  };

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
    if (
      !force &&
      !confirm(`למחוק לצמיתות את ${row.kind === "booking" ? "השריון" : "ההזמנה"} של ${row.name}?`)
    )
      return;
    try {
      await doDelete({ data: { kind: row.kind, id: row.id, force } });
      toast.success("נמחק");
      qc.invalidateQueries({ queryKey: ["admin-all-orders"] });
    } catch (e: any) {
      const message = e?.message ?? "";
      if (message.includes(PHOTO_WORKFLOW_LINKED_PREFIX)) {
        const detail = message.slice(
          message.indexOf(PHOTO_WORKFLOW_LINKED_PREFIX) + PHOTO_WORKFLOW_LINKED_PREFIX.length,
        );
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
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full gap-2"
          onClick={() => q.refetch()}
        >
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
                  <tr
                    key={key}
                    className={`border-t border-border ${r.date && r.date < todayKey ? "bg-rose-50/70" : ""}`}
                  >
                    <td className="p-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setExpanded(expanded === key ? null : key)}
                      >
                        {expanded === key ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className="gap-1 text-[11px]">
                        {r.kind === "booking" ? (
                          <Camera className="h-3 w-3" />
                        ) : (
                          <Package className="h-3 w-3" />
                        )}
                        {r.kind === "booking" ? "סטודיו" : "אביזרים"}
                      </Badge>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("he-IL")}
                    </td>
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3" dir="ltr">
                      {r.phone}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {r.date ? new Date(r.date).toLocaleDateString("he-IL") : "—"}
                      {r.time && (
                        <span className="text-muted-foreground text-xs block" dir="ltr">
                          {r.time}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-display text-peach-deep">₪{r.total.toFixed(0)}</td>
                    <td className="p-3">
                      <Select value={r.status} onValueChange={(v) => setStatus(r, v)}>
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusList.map((s) => (
                            <SelectItem key={s.v} value={s.v}>
                              {s.l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditRow(r)}
                          aria-label="עריכת הזמנה"
                          title="עריכת הזמנה, מחיר וקופון"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => sendPaymentRequest(r)}
                          disabled={sendingPaymentFor === key}
                          aria-label="שליחת בקשת תשלום"
                          title="שליחת בקשת תשלום במייל"
                        >
                          <CreditCard
                            className={`h-4 w-4 ${sendingPaymentFor === key ? "opacity-40" : ""}`}
                          />
                        </Button>
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
                      </div>
                    </td>
                  </tr>
                  {expanded === key && (
                    <tr className="bg-cream/40">
                      <td colSpan={9} className="p-4">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                              פריטים
                            </div>
                            <ul className="text-sm space-y-1">
                              {r.kind === "order"
                                ? (o.order_items ?? []).map((oi: any) => (
                                    <li key={oi.id} className="flex justify-between">
                                      <span>
                                        {oi.item_name}{" "}
                                        <span className="text-muted-foreground">
                                          ({oi.item_sku})
                                        </span>{" "}
                                        × {oi.quantity}
                                      </span>
                                      <span>₪{(oi.price * oi.quantity).toFixed(0)}</span>
                                    </li>
                                  ))
                                : (Array.isArray(o.reserved_items) ? o.reserved_items : []).map(
                                    (ri: any, i: number) => (
                                      <li key={i}>{ri?.name ?? ri?.sku ?? String(ri)}</li>
                                    ),
                                  )}
                              {((r.kind === "order" && !(o.order_items ?? []).length) ||
                                (r.kind === "booking" &&
                                  !(Array.isArray(o.reserved_items) ? o.reserved_items : [])
                                    .length)) && (
                                <li className="text-muted-foreground">אין אביזרים משוריינים</li>
                              )}
                            </ul>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                              פרטים
                            </div>
                            <div className="text-sm space-y-1">
                              {r.kind === "order" ? (
                                <div>
                                  החזרה:{" "}
                                  {o.return_date
                                    ? new Date(o.return_date).toLocaleDateString("he-IL")
                                    : "—"}
                                </div>
                              ) : (
                                <>
                                  <div>חבילה: {o.package ?? "—"}</div>
                                  <div>
                                    שעות:{" "}
                                    <span dir="ltr">
                                      {o.start_time}–{o.end_time}
                                    </span>
                                  </div>
                                </>
                              )}
                              <div>
                                מקדמה: ₪{Number(o.deposit_amount ?? 0).toFixed(0)} (
                                {o.deposit_status ?? "—"})
                              </div>
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
              <tr>
                <td colSpan={9} className="p-16 text-center text-muted-foreground">
                  אין הזמנות עדיין.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <OrderEditDialog
        row={editRow}
        onClose={() => setEditRow(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["admin-all-orders"] });
          qc.invalidateQueries({ queryKey: ["calendar-entries"] });
        }}
      />
    </div>
  );
}

type ItemLine = {
  id: string;
  item_name: string;
  item_sku: string | null;
  quantity: number;
  price: number;
};

/**
 * The "עריכת הזמנה" dialog opened from the pencil icon on /admin/orders —
 * contact/scheduling details, order line items (props orders only), a
 * manual price override, and applying a coupon code retroactively. Kept as
 * its own component (rather than inline in the table row) since it owns a
 * fair amount of local form/item-editing state that only exists while a
 * single row is being edited.
 */
function OrderEditDialog({
  row,
  onClose,
  onSaved,
}: {
  row: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemLine[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [priceOverride, setPriceOverride] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  useEffect(() => {
    if (!row) return;
    const o = row.raw;
    setName(row.name === "—" ? "" : row.name);
    setPhone(row.phone === "—" ? "" : row.phone);
    setDate(row.date ?? "");
    setReturnDate(row.kind === "order" ? (o.return_date ?? "") : "");
    setStartTime(row.kind === "booking" ? (o.start_time ?? "").slice(0, 5) : "");
    setEndTime(row.kind === "booking" ? (o.end_time ?? "").slice(0, 5) : "");
    setNotes(o.notes ?? "");
    setItems(
      row.kind === "order"
        ? (o.order_items ?? []).map((oi: any) => ({
            id: oi.id,
            item_name: oi.item_name,
            item_sku: oi.item_sku,
            quantity: oi.quantity,
            price: Number(oi.price),
          }))
        : [],
    );
    setRemovedIds([]);
    setPriceOverride("");
    setCouponCode("");
  }, [row]);

  const doUpdateDetails = useServerFn(adminUpdateOrderDetails);
  const doUpdateItems = useServerFn(adminUpdateOrderItems);
  const doSetPrice = useServerFn(adminSetPrice);
  const doApplyCoupon = useServerFn(adminApplyCoupon);

  if (!row) return null;

  const updateItem = (id: string, patch: Partial<ItemLine>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setRemovedIds((prev) => [...prev, id]);
  };
  const itemsTotal = items.reduce((s, it) => s + it.price * it.quantity, 0);

  const save = async () => {
    setSaving(true);
    try {
      await doUpdateDetails({
        data: {
          kind: row.kind,
          id: row.id,
          contact_name: name.trim() || undefined,
          contact_phone: phone.trim() || undefined,
          session_date: date || undefined,
          return_date: row.kind === "order" ? returnDate || undefined : undefined,
          start_time: row.kind === "booking" ? startTime || undefined : undefined,
          end_time: row.kind === "booking" ? endTime || undefined : undefined,
          notes,
        },
      });

      if (row.kind === "order" && (items.length > 0 || removedIds.length > 0)) {
        await doUpdateItems({
          data: {
            orderId: row.id,
            lines: items.map((it) => ({ id: it.id, quantity: it.quantity, price: it.price })),
            removedIds,
          },
        });
      }

      if (priceOverride.trim()) {
        const amount = Number(priceOverride);
        if (!Number.isNaN(amount) && amount >= 0) {
          await doSetPrice({ data: { kind: row.kind, id: row.id, amount } });
        }
      }

      toast.success("ההזמנה עודכנה");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(heError(e, "עדכון ההזמנה נכשל"));
    } finally {
      setSaving(false);
    }
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setApplyingCoupon(true);
    try {
      const res = await doApplyCoupon({
        data: { kind: row.kind, id: row.id, code: couponCode.trim() },
      });
      toast.success(`הקופון הוחל — הנחה של ₪${res.discount}`);
      setCouponCode("");
      onSaved();
    } catch (e) {
      toast.error(heError(e, "החלת הקופון נכשלה"));
    } finally {
      setApplyingCoupon(false);
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>עריכת {row.kind === "booking" ? "שריון" : "הזמנה"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-right">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <div className="text-xs text-muted-foreground mb-1">שם</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block text-sm">
              <div className="text-xs text-muted-foreground mb-1">טלפון</div>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
            </label>
            <label className="block text-sm">
              <div className="text-xs text-muted-foreground mb-1">
                {row.kind === "booking" ? "תאריך צילום" : "תאריך איסוף"}
              </div>
              <Input type="date" value={date ?? ""} onChange={(e) => setDate(e.target.value)} />
            </label>
            {row.kind === "order" ? (
              <label className="block text-sm">
                <div className="text-xs text-muted-foreground mb-1">תאריך החזרה</div>
                <Input
                  type="date"
                  value={returnDate ?? ""}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </label>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  <div className="text-xs text-muted-foreground mb-1">שעת התחלה</div>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <div className="text-xs text-muted-foreground mb-1">שעת סיום</div>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </label>
              </div>
            )}
          </div>

          <label className="block text-sm">
            <div className="text-xs text-muted-foreground mb-1">הערות</div>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>

          {row.kind === "order" && (
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                פריטים
              </div>
              {items.length === 0 && (
                <div className="text-sm text-muted-foreground">אין פריטים.</div>
              )}
              <div className="space-y-2">
                {items.map((it) => (
                  <div key={it.id} className="flex items-center gap-2 bg-cream/50 rounded-xl p-2">
                    <div className="flex-1 min-w-0 text-sm truncate">
                      {it.item_name} <span className="text-muted-foreground">({it.item_sku})</span>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      className="w-16 h-8"
                      value={it.quantity}
                      onChange={(e) =>
                        updateItem(it.id, { quantity: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input
                      type="number"
                      min={0}
                      className="w-20 h-8"
                      value={it.price}
                      onChange={(e) =>
                        updateItem(it.id, { price: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => removeItem(it.id)}
                      aria-label="הסרת פריט"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              {items.length > 0 && (
                <div className="text-sm text-muted-foreground mt-2">
                  סה״כ פריטים: ₪{itemsTotal.toFixed(0)}
                </div>
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border">
            <label className="block text-sm">
              <div className="text-xs text-muted-foreground mb-1">
                מחיר סופי (עדכון ידני, ₪) — נוכחי: ₪{row.total.toFixed(0)}
              </div>
              <Input
                type="number"
                min={0}
                placeholder="השאירי ריק כדי לא לשנות"
                value={priceOverride}
                onChange={(e) => setPriceOverride(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <div className="text-xs text-muted-foreground mb-1">החלת קוד קופון</div>
              <div className="flex gap-2">
                <Input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="קוד קופון"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={applyCoupon}
                  disabled={applyingCoupon || !couponCode.trim()}
                >
                  {applyingCoupon ? "מחילה…" : "החלה"}
                </Button>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              ביטול
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "שומר…" : "שמירה"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

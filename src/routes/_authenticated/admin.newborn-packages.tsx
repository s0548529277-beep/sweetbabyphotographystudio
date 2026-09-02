import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { he } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  listNewbornOrders,
  createNewbornOrder,
  toggleNewbornOrderStep,
  updateNewbornOrderContact,
  deleteNewbornOrder,
} from "@/lib/newborn-orders.functions";
import { createPhotoClient } from "@/lib/photo-clients.functions";
import { NEWBORN_PACKAGES, NEWBORN_ADDONS, NEWBORN_TIMELINE_STEPS, findNewbornPackage } from "@/lib/newborn-packages";
import { heError } from "@/lib/he-errors";
import { Baby, Plus, Pencil, Trash2, Check, Circle, Phone, Mail, CalendarDays, Loader2, Images, List, CalendarRange } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/newborn-packages")({
  component: NewbornPackagesAdmin,
});

type OrderRow = {
  id: string;
  package_id: string;
  addons: { id: string; label: string; price: number }[];
  base_price: number;
  addons_price: number;
  total_price: number;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  session_date: string | null;
  notes: string | null;
  created_at: string;
  [key: string]: any; // ${step.key}_at columns
};

const emptyCreateForm = {
  package_id: "",
  addon_ids: [] as string[],
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  session_date: "",
  notes: "",
};

type EditForm = { contact_name: string; contact_phone: string; contact_email: string; session_date: string; notes: string };

function toEditForm(o: OrderRow): EditForm {
  return {
    contact_name: o.contact_name,
    contact_phone: o.contact_phone,
    contact_email: o.contact_email ?? "",
    session_date: o.session_date ?? "",
    notes: o.notes ?? "",
  };
}

function NewbornPackagesAdmin() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const fetchOrders = useServerFn(listNewbornOrders);
  const runCreate = useServerFn(createNewbornOrder);
  const runToggle = useServerFn(toggleNewbornOrderStep);
  const runUpdateContact = useServerFn(updateNewbornOrderContact);
  const runDelete = useServerFn(deleteNewbornOrder);
  const runCreatePhotoClient = useServerFn(createPhotoClient);

  const orders = useQuery({ queryKey: ["newborn-orders"], queryFn: () => fetchOrders({}) });
  const rows = (orders.data ?? []) as OrderRow[];

  const [view, setView] = useState<"list" | "calendar">("list");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [saving, setSaving] = useState(false);
  const [busyStep, setBusyStep] = useState<string | null>(null); // `${orderId}:${stepKey}`
  const [openingGalleryId, setOpeningGalleryId] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<OrderRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const selectedPackage = findNewbornPackage(createForm.package_id);
  const addonsTotal = NEWBORN_ADDONS.filter((a) => createForm.addon_ids.includes(a.id)).reduce((s, a) => s + a.price, 0);
  const total = (selectedPackage?.price ?? 0) + addonsTotal;

  const toggleAddon = (id: string) =>
    setCreateForm((f) => ({ ...f, addon_ids: f.addon_ids.includes(id) ? f.addon_ids.filter((a) => a !== id) : [...f.addon_ids, id] }));

  const submitCreate = async () => {
    if (!createForm.package_id) return toast.error("יש לבחור חבילה");
    if (!createForm.contact_name.trim() || !createForm.contact_phone.trim()) return toast.error("שם וטלפון הם שדות חובה");
    setSaving(true);
    try {
      await runCreate({
        data: {
          package_id: createForm.package_id,
          addon_ids: createForm.addon_ids,
          contact_name: createForm.contact_name.trim(),
          contact_phone: createForm.contact_phone.trim(),
          contact_email: createForm.contact_email.trim() || null,
          session_date: createForm.session_date || null,
          notes: createForm.notes.trim() || null,
        },
      });
      toast.success("ההזמנה נוצרה — הכרטיסייה מוכנה למטה");
      setCreateForm(emptyCreateForm);
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["newborn-orders"] });
    } catch (e) {
      toast.error(heError(e, "יצירת ההזמנה נכשלה"));
    } finally {
      setSaving(false);
    }
  };

  const toggleStep = async (order: OrderRow, stepKey: string, done: boolean) => {
    setBusyStep(`${order.id}:${stepKey}`);
    // Optimistic — the checklist should feel instant; rolled back via a refetch if the save actually fails.
    qc.setQueryData(["newborn-orders"], (prev: OrderRow[] | undefined) =>
      prev?.map((o) => (o.id === order.id ? { ...o, [`${stepKey}_at`]: done ? new Date().toISOString() : null } : o)),
    );
    try {
      await runToggle({ data: { id: order.id, step_key: stepKey, done } });
    } catch (e) {
      toast.error(heError(e, "העדכון נכשל"));
      qc.invalidateQueries({ queryKey: ["newborn-orders"] });
    } finally {
      setBusyStep(null);
    }
  };

  const openEdit = (order: OrderRow) => {
    setEditTarget(order);
    setEditForm(toEditForm(order));
  };

  const submitEdit = async () => {
    if (!editTarget || !editForm) return;
    if (!editForm.contact_name.trim() || !editForm.contact_phone.trim()) return toast.error("שם וטלפון הם שדות חובה");
    setEditSaving(true);
    try {
      await runUpdateContact({
        data: {
          id: editTarget.id,
          contact_name: editForm.contact_name.trim(),
          contact_phone: editForm.contact_phone.trim(),
          contact_email: editForm.contact_email.trim() || null,
          session_date: editForm.session_date || null,
          notes: editForm.notes.trim() || null,
        },
      });
      toast.success("הפרטים עודכנו");
      setEditTarget(null);
      qc.invalidateQueries({ queryKey: ["newborn-orders"] });
    } catch (e) {
      toast.error(heError(e, "העדכון נכשל"));
    } finally {
      setEditSaving(false);
    }
  };

  const remove = async (order: OrderRow) => {
    if (!confirm(`למחוק את ההזמנה של ${order.contact_name}?`)) return;
    try {
      await runDelete({ data: { id: order.id } });
      qc.invalidateQueries({ queryKey: ["newborn-orders"] });
    } catch (e) {
      toast.error(heError(e, "המחיקה נכשלה"));
    }
  };

  // Opens (or reuses, if one already exists for her email) a real client
  // gallery in the existing photo-delivery system (/admin/photo-clients) —
  // upload, client photo selection, editing/album stages all already live
  // there, so this reuses it rather than rebuilding a second gallery
  // system inside this page.
  const openGallery = async (order: OrderRow) => {
    if (!order.contact_email) {
      toast.error("צריך קודם להוסיף מייל ללקוחה — פותחת עריכה");
      openEdit(order);
      return;
    }
    const pkg = findNewbornPackage(order.package_id);
    setOpeningGalleryId(order.id);
    try {
      const res = await runCreatePhotoClient({
        data: {
          email: order.contact_email,
          name: order.contact_name,
          phone: order.contact_phone,
          sessionDate: order.session_date || undefined,
          packageType: "custom",
          photosToEdit: pkg?.photosToEdit,
          albumUpgrades: pkg ? [pkg.name, ...pkg.features, ...order.addons.map((a) => a.label)].join(", ") : undefined,
          sendEmail: false,
        },
      });
      toast.success(res.isNewAccount ? "נפתחה גלריה + חשבון חדש ללקוחה" : "נפתחה הגלריה שלה");
      nav({ to: "/admin/photo-clients/$bookingId", params: { bookingId: res.workflowId } });
    } catch (e) {
      toast.error(heError(e, "פתיחת הגלריה נכשלה"));
    } finally {
      setOpeningGalleryId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
            <Baby className="h-5 w-5" /> חבילות ניו-בורן
          </h2>
          <p className="text-sm text-muted-foreground">מעקב פנימי בלבד — מרגע סגירת החבילה ועד הגעת האלבום ללקוחה. לא מוצג לאתר או ללקוחות.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex bg-card rounded-full border border-primary/10 p-1">
            <button
              type="button"
              onClick={() => setView("list")}
              className={`h-8 px-3 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors ${
                view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-cream"
              }`}
            >
              <List className="h-3.5 w-3.5" /> רשימה
            </button>
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={`h-8 px-3 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors ${
                view === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-cream"
              }`}
            >
              <CalendarRange className="h-3.5 w-3.5" /> לוח
            </button>
          </div>
          <Button
            onClick={() => {
              setCreateForm(emptyCreateForm);
              setCreateOpen(true);
            }}
            className="rounded-full gap-2"
          >
            <Plus className="h-4 w-4" /> הזמנה חדשה
          </Button>
        </div>
      </div>

      {orders.isLoading && <p className="text-sm text-muted-foreground">טוען…</p>}
      {!orders.isLoading && rows.length === 0 && (
        <div className="bg-card rounded-2xl border border-primary/10 p-8 text-center text-sm text-muted-foreground">
          עדיין אין הזמנות חבילת ניו-בורן. אפשר להתחיל למעלה.
        </div>
      )}

      {view === "calendar" ? (
        <NewbornCalendarView rows={rows} onEdit={openEdit} onOpenGallery={openGallery} openingGalleryId={openingGalleryId} />
      ) : (
        <div className="space-y-4">
          {rows.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busyStep={busyStep}
              openingGallery={openingGalleryId === order.id}
              onToggleStep={(stepKey, done) => toggleStep(order, stepKey, done)}
              onEdit={() => openEdit(order)}
              onDelete={() => remove(order)}
              onOpenGallery={() => openGallery(order)}
            />
          ))}
        </div>
      )}

      {/* New order */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>הזמנת חבילת ניו-בורן חדשה</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <Label className="mb-2 block">בחירת חבילה</Label>
              <div className="space-y-2">
                {NEWBORN_PACKAGES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setCreateForm((f) => ({ ...f, package_id: p.id }))}
                    className={`w-full text-right rounded-xl border p-3 transition-colors ${
                      createForm.package_id === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-primary">{p.name}</span>
                      <span className="font-display text-lg text-primary">₪{p.price}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{p.features.join(" · ")}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">תוספות</Label>
              <div className="grid grid-cols-2 gap-2">
                {NEWBORN_ADDONS.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm rounded-lg border border-border p-2 cursor-pointer">
                    <Checkbox checked={createForm.addon_ids.includes(a.id)} onCheckedChange={() => toggleAddon(a.id)} />
                    <span className="flex-1">{a.label}</span>
                    <span className="text-muted-foreground">+₪{a.price}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-blush/40 p-3">
              <span className="text-sm font-medium text-primary">סה״כ</span>
              <span className="font-display text-2xl text-primary">₪{total}</span>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>שם הלקוחה *</Label>
                <Input value={createForm.contact_name} onChange={(e) => setCreateForm((f) => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div>
                <Label>טלפון *</Label>
                <Input dir="ltr" value={createForm.contact_phone} onChange={(e) => setCreateForm((f) => ({ ...f, contact_phone: e.target.value }))} />
              </div>
              <div>
                <Label>מייל</Label>
                <Input dir="ltr" type="email" value={createForm.contact_email} onChange={(e) => setCreateForm((f) => ({ ...f, contact_email: e.target.value }))} />
              </div>
              <div>
                <Label>תאריך צילום (אם ידוע)</Label>
                <Input type="date" value={createForm.session_date} onChange={(e) => setCreateForm((f) => ({ ...f, session_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>הערות</Label>
              <Textarea value={createForm.notes} onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitCreate} disabled={saving} className="rounded-full w-full">
              {saving ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : null}
              יצירת הזמנה ופתיחת כרטיסייה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit contact card */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>עריכת פרטי לקוחה</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-3 py-2">
              <div>
                <Label>שם הלקוחה *</Label>
                <Input value={editForm.contact_name} onChange={(e) => setEditForm((f) => f && { ...f, contact_name: e.target.value })} />
              </div>
              <div>
                <Label>טלפון *</Label>
                <Input dir="ltr" value={editForm.contact_phone} onChange={(e) => setEditForm((f) => f && { ...f, contact_phone: e.target.value })} />
              </div>
              <div>
                <Label>מייל</Label>
                <Input dir="ltr" type="email" value={editForm.contact_email} onChange={(e) => setEditForm((f) => f && { ...f, contact_email: e.target.value })} />
              </div>
              <div>
                <Label>תאריך צילום</Label>
                <Input type="date" value={editForm.session_date} onChange={(e) => setEditForm((f) => f && { ...f, session_date: e.target.value })} />
              </div>
              <div>
                <Label>הערות</Label>
                <Textarea value={editForm.notes} onChange={(e) => setEditForm((f) => f && { ...f, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={submitEdit} disabled={editSaving} className="rounded-full w-full">
              {editSaving ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : null}
              שמירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderCard({
  order,
  busyStep,
  openingGallery,
  onToggleStep,
  onEdit,
  onDelete,
  onOpenGallery,
}: {
  order: OrderRow;
  busyStep: string | null;
  openingGallery?: boolean;
  onToggleStep: (stepKey: string, done: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenGallery: () => void;
}) {
  const pkg = findNewbornPackage(order.package_id);
  const doneCount = NEWBORN_TIMELINE_STEPS.filter((s) => order[`${s.key}_at`]).length;

  return (
    <div className="bg-card rounded-2xl border border-primary/10 p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-lg text-primary">{order.contact_name}</span>
            <Badge variant="secondary">{pkg?.name ?? order.package_id}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
            <span className="flex items-center gap-1" dir="ltr">
              <Phone className="h-3 w-3" /> {order.contact_phone}
            </span>
            {order.contact_email && (
              <span className="flex items-center gap-1" dir="ltr">
                <Mail className="h-3 w-3" /> {order.contact_email}
              </span>
            )}
            {order.session_date && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> {order.session_date}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-display text-xl text-primary ml-1">₪{order.total_price}</span>
          <button type="button" onClick={onEdit} className="h-8 w-8 rounded-full hover:bg-primary/10 text-primary flex items-center justify-center">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onDelete} className="h-8 w-8 rounded-full hover:bg-destructive/10 text-destructive flex items-center justify-center">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenGallery}
        disabled={openingGallery}
        title={order.contact_email ? undefined : "יש להוסיף מייל ללקוחה קודם"}
        className="w-full mb-3 h-9 rounded-xl border border-primary/15 hover:bg-primary/5 text-sm text-primary flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
      >
        {openingGallery ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Images className="h-3.5 w-3.5" />}
        פתיחת גלריה ללקוחה
      </button>

      {order.notes && <p className="text-xs text-muted-foreground bg-blush/30 rounded-lg p-2 mb-3 whitespace-pre-line">{order.notes}</p>}

      <div className="mb-2 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(doneCount / NEWBORN_TIMELINE_STEPS.length) * 100}%` }} />
        </div>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          {doneCount}/{NEWBORN_TIMELINE_STEPS.length}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-1.5">
        {NEWBORN_TIMELINE_STEPS.map((step) => {
          const doneAt = order[`${step.key}_at`] as string | null;
          const busy = busyStep === `${order.id}:${step.key}`;
          return (
            <button
              key={step.key}
              type="button"
              disabled={busy}
              onClick={() => onToggleStep(step.key, !doneAt)}
              className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 text-right transition-colors ${
                doneAt ? "bg-forest/10 text-forest" : "bg-cream/60 text-muted-foreground hover:bg-cream"
              }`}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : doneAt ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 shrink-0" />
              )}
              <span className="flex-1">{step.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Month calendar of orders by session_date — same shadcn Calendar
// component + "scheduled day" modifier pattern as /admin/calendar, so this
// reads like a familiar view rather than a one-off widget.
function NewbornCalendarView({
  rows,
  onEdit,
  onOpenGallery,
  openingGalleryId,
}: {
  rows: OrderRow[];
  onEdit: (order: OrderRow) => void;
  onOpenGallery: (order: OrderRow) => void;
  openingGalleryId: string | null;
}) {
  const [selected, setSelected] = useState<Date | undefined>(new Date());

  const { byDate, scheduledDates } = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    for (const o of rows) {
      if (!o.session_date) continue;
      const list = map.get(o.session_date) ?? [];
      list.push(o);
      map.set(o.session_date, list);
    }
    return {
      byDate: map,
      scheduledDates: Array.from(map.keys()).map((s) => {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      }),
    };
  }, [rows]);

  const toLocalKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const key = selected ? toLocalKey(selected) : "";
  const dayOrders = byDate.get(key) ?? [];
  const withoutDate = rows.filter((o) => !o.session_date);

  return (
    <div className="grid lg:grid-cols-[auto_1fr] gap-6">
      <div className="bg-card rounded-2xl p-4 border border-primary/10 w-fit h-fit">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={setSelected}
          locale={he}
          modifiers={{ scheduled: scheduledDates }}
          modifiersClassNames={{ scheduled: "bg-blush text-primary font-medium rounded-full" }}
        />
        <div className="text-xs text-muted-foreground mt-3 flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-blush" /> יום עם צילום קבוע
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-card rounded-2xl p-5 border border-primary/10">
          <h3 className="font-display text-xl text-primary mb-3">
            {selected?.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          {dayOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 border border-dashed border-primary/15 rounded-xl">אין צילומים ליום זה</p>
          ) : (
            <div className="space-y-2">
              {dayOrders.map((o) => (
                <MiniOrderRow key={o.id} order={o} openingGallery={openingGalleryId === o.id} onEdit={() => onEdit(o)} onOpenGallery={() => onOpenGallery(o)} />
              ))}
            </div>
          )}
        </div>

        {withoutDate.length > 0 && (
          <div className="bg-card rounded-2xl p-5 border border-primary/10">
            <h3 className="text-sm font-semibold text-primary mb-3">בלי תאריך צילום עדיין ({withoutDate.length})</h3>
            <div className="space-y-2">
              {withoutDate.map((o) => (
                <MiniOrderRow key={o.id} order={o} openingGallery={openingGalleryId === o.id} onEdit={() => onEdit(o)} onOpenGallery={() => onOpenGallery(o)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniOrderRow({
  order,
  openingGallery,
  onEdit,
  onOpenGallery,
}: {
  order: OrderRow;
  openingGallery: boolean;
  onEdit: () => void;
  onOpenGallery: () => void;
}) {
  const pkg = findNewbornPackage(order.package_id);
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-blush/25">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-primary">{order.contact_name}</span>
          <Badge variant="secondary" className="text-[10px]">{pkg?.name ?? order.package_id}</Badge>
        </div>
        <div className="text-xs text-muted-foreground" dir="ltr">{order.contact_phone}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={onEdit} className="h-8 w-8 rounded-full hover:bg-primary/10 text-primary flex items-center justify-center">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onOpenGallery}
          disabled={openingGallery}
          title={order.contact_email ? undefined : "יש להוסיף מייל ללקוחה קודם"}
          className="h-8 px-3 rounded-full border border-primary/15 hover:bg-primary/5 text-xs text-primary flex items-center gap-1.5 disabled:opacity-60"
        >
          {openingGallery ? <Loader2 className="h-3 w-3 animate-spin" /> : <Images className="h-3 w-3" />}
          גלריה
        </button>
      </div>
    </div>
  );
}

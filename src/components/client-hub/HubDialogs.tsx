// Create / edit dialogs for the two non-newborn kinds of the unified client page.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { heError } from "@/lib/he-errors";
import { DateHints, confirmRestDay } from "@/components/client-management/DateHints";
import { createStudioCustomOrder, updateStudioCustomOrder } from "@/lib/studio-custom-orders.functions";
import { hubKind } from "@/lib/client-hub";

const selectCls = "h-10 w-full rounded-md border bg-background px-3 text-sm";

type OutdoorPackageType = { id: string; name: string; price: number; description: string; active: boolean };

type OutdoorForm = {
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
  total_price: string;
  deposit_paid: boolean;
  notes: string;
};

const emptyOutdoor: OutdoorForm = {
  package_type_id: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  children_count: "",
  children_names: "",
  styling_call_date: "",
  session_date: "",
  session_time: "",
  total_price: "",
  deposit_paid: false,
  notes: "",
};

/** New / edit outdoor client. Same save rules as the original outdoor page (package fields are copied only when the package choice changes; a rescheduled shoot resets the contract). */
export function OutdoorOrderDialog({
  open,
  onOpenChange,
  initial,
  defaultDate,
  sameDayTimes,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: any | null;
  defaultDate?: string;
  sameDayTimes: (date: string | null | undefined, excludeId?: string) => string[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<OutdoorForm>(emptyOutdoor);
  const [saving, setSaving] = useState(false);

  const packages = useQuery({
    queryKey: ["admin-outdoor-package-types"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("outdoor_package_types")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OutdoorPackageType[];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        id: initial.id,
        package_type_id: initial.package_type_id ?? "",
        contact_name: initial.contact_name,
        contact_phone: initial.contact_phone,
        contact_email: initial.contact_email ?? "",
        children_count: initial.children_count != null ? String(initial.children_count) : "",
        children_names: initial.children_names ?? "",
        styling_call_date: initial.styling_call_date ?? "",
        session_date: initial.session_date ?? "",
        session_time: initial.session_time ? String(initial.session_time).slice(0, 5) : "",
        total_price: initial.total_price != null ? String(initial.total_price) : "",
        deposit_paid: !!initial.deposit_paid,
        notes: initial.notes ?? "",
      });
    } else {
      setForm({ ...emptyOutdoor, session_date: defaultDate ?? "" });
    }
  }, [open, initial, defaultDate]);

  const set = (patch: Partial<OutdoorForm>) => setForm((f) => ({ ...f, ...patch }));

  const pickPackage = (id: string) => {
    const p = (packages.data ?? []).find((x) => x.id === id);
    // A freshly chosen package fills the price; it stays editable (a price agreed by phone).
    set({ package_type_id: id, total_price: p ? String(p.price) : form.total_price });
  };

  const save = async () => {
    const name = form.contact_name.trim();
    const phone = form.contact_phone.trim();
    if (!name) return toast.error("שם הלקוחה חובה");
    if (!phone) return toast.error("טלפון חובה");
    if ((initial?.session_date ?? "") !== form.session_date && !confirmRestDay(form.session_date)) return;
    setSaving(true);
    const chosen = (packages.data ?? []).find((p) => p.id === form.package_type_id);
    const packageChanged = !initial || (initial.package_type_id ?? "") !== form.package_type_id;
    const pkgFields = packageChanged
      ? { package_name: chosen?.name ?? null, package_description: chosen?.description ?? null }
      : {};
    const resets: Record<string, null> = {};
    if (initial) {
      if (
        (initial.session_date ?? "") !== (form.session_date || "") ||
        (initial.session_time ? String(initial.session_time).slice(0, 5) : "") !== (form.session_time || "")
      )
        resets.contract_sent_at = null;
      if ((initial.styling_call_date ?? "") !== (form.styling_call_date || ""))
        resets.styling_call_reminder_sent_at = null;
    }
    const price = form.total_price.trim() === "" ? null : Number(form.total_price);
    const payload = {
      package_type_id: form.package_type_id || null,
      ...pkgFields,
      ...resets,
      total_price: price != null && !Number.isNaN(price) ? price : (chosen?.price ?? null),
      contact_name: name,
      contact_phone: phone,
      contact_email: form.contact_email.trim() || null,
      children_count: form.children_count ? Number(form.children_count) : null,
      children_names: form.children_names.trim() || null,
      styling_call_date: form.styling_call_date || null,
      session_date: form.session_date || null,
      session_time: form.session_time || null,
      deposit_paid: form.deposit_paid,
      notes: form.notes.trim() || null,
    };
    const { error } = form.id
      ? await (supabase as any).from("outdoor_package_orders").update(payload).eq("id", form.id)
      : await (supabase as any).from("outdoor_package_orders").insert(payload);
    setSaving(false);
    if (error) return toast.error(heError(error.message));
    toast.success(form.id ? "הלקוחה עודכנה" : "הלקוחה נוספה");
    onOpenChange(false);
    qc.invalidateQueries({ queryKey: ["admin-outdoor-orders"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className={`${hubKind("outdoor").scope} max-h-[85vh] max-w-lg overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>{form.id ? "עריכת לקוחת צילומי חוץ" : "לקוחה חדשה — צילומי חוץ"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>חבילה</Label>
            <select className={selectCls} value={form.package_type_id} onChange={(e) => pickPackage(e.target.value)}>
              <option value="">— בחירת חבילה —</option>
              {(packages.data ?? [])
                .filter((p) => p.active || p.id === form.package_type_id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — ₪{p.price}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label>סכום כולל (₪)</Label>
            <Input type="number" min={0} dir="ltr" value={form.total_price} onChange={(e) => set({ total_price: e.target.value })} placeholder="מתמלא מהחבילה, אפשר לשנות" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>שם הלקוחה *</Label>
              <Input value={form.contact_name} onChange={(e) => set({ contact_name: e.target.value })} />
            </div>
            <div>
              <Label>טלפון *</Label>
              <Input dir="ltr" value={form.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>מייל</Label>
              <Input dir="ltr" type="email" value={form.contact_email} onChange={(e) => set({ contact_email: e.target.value })} />
            </div>
            <div>
              <Label>מספר ילדים</Label>
              <Input type="number" min={0} dir="ltr" value={form.children_count} onChange={(e) => set({ children_count: e.target.value })} />
            </div>
            <div>
              <Label>שמות הילדים</Label>
              <Input value={form.children_names} onChange={(e) => set({ children_names: e.target.value })} />
            </div>
            <div>
              <Label>תאריך שיחת סטיילינג</Label>
              <Input type="date" value={form.styling_call_date} onChange={(e) => set({ styling_call_date: e.target.value })} />
            </div>
            <div />
            <div>
              <Label>תאריך צילום</Label>
              <Input type="date" value={form.session_date} onChange={(e) => set({ session_date: e.target.value })} />
              <DateHints date={form.session_date} sameDayTimes={sameDayTimes(form.session_date, form.id)} />
            </div>
            <div>
              <Label>שעת צילום</Label>
              <Input type="time" value={form.session_time} onChange={(e) => set({ session_time: e.target.value })} />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={form.deposit_paid} onChange={(e) => set({ deposit_paid: e.target.checked })} />
            מקדמה שולמה
          </label>
          <p className="text-[11px] text-muted-foreground">
            צילומי חוץ הם מחוץ לסטודיו — לא משריינים שעות סטודיו ולא תופסים את חדר המשפחה.
          </p>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving} className="w-full rounded-full">
            {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
            {form.id ? "שמירה" : "יצירת לקוחה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type StudioForm = {
  id?: string;
  package_name: string;
  package_description: string;
  total_price: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  session_date: string;
  session_time: string;
  duration_hours: string;
  notes: string;
};

const emptyStudio: StudioForm = {
  package_name: "סטודיו מותאם אישית",
  package_description: "",
  total_price: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  session_date: "",
  session_time: "10:00",
  duration_hours: "2",
  notes: "",
};

const DURATIONS = ["1", "1.5", "2", "2.5", "3", "4", "5", "6", "8"];

/** New / edit custom studio package. Saving a dated order reserves the studio (calendar block + Google Calendar event). */
export function StudioOrderDialog({
  open,
  onOpenChange,
  initial,
  defaultDate,
  sameDayTimes,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: any | null;
  defaultDate?: string;
  sameDayTimes: (date: string | null | undefined, excludeId?: string) => string[];
}) {
  const qc = useQueryClient();
  const runCreate = useServerFn(createStudioCustomOrder);
  const runUpdate = useServerFn(updateStudioCustomOrder);
  const [form, setForm] = useState<StudioForm>(emptyStudio);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        id: initial.id,
        package_name: initial.package_name ?? "סטודיו מותאם אישית",
        package_description: initial.package_description ?? "",
        total_price: initial.total_price != null ? String(initial.total_price) : "",
        contact_name: initial.contact_name,
        contact_phone: initial.contact_phone,
        contact_email: initial.contact_email ?? "",
        session_date: initial.session_date ?? "",
        session_time: initial.session_time ? String(initial.session_time).slice(0, 5) : "",
        duration_hours: String(Number(initial.duration_hours ?? 2)),
        notes: initial.notes ?? "",
      });
    } else {
      setForm({ ...emptyStudio, session_date: defaultDate ?? "" });
    }
  }, [open, initial, defaultDate]);

  const set = (patch: Partial<StudioForm>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.contact_name.trim() || !form.contact_phone.trim()) return toast.error("שם וטלפון הם שדות חובה");
    if (!form.package_name.trim()) return toast.error("שם החבילה חובה");
    if (form.session_date && !form.session_time) return toast.error("לשריון הסטודיו צריך גם שעת התחלה");
    if ((initial?.session_date ?? "") !== form.session_date && !confirmRestDay(form.session_date)) return;
    setSaving(true);
    try {
      const body = {
        package_name: form.package_name.trim(),
        package_description: form.package_description.trim() || null,
        total_price: Number(form.total_price) || 0,
        contact_name: form.contact_name.trim(),
        contact_phone: form.contact_phone.trim(),
        contact_email: form.contact_email.trim() || null,
        session_date: form.session_date || null,
        session_time: form.session_time || null,
        duration_hours: Number(form.duration_hours) || 2,
        notes: form.notes.trim() || null,
      };
      const result: any = form.id
        ? await runUpdate({ data: { id: form.id, ...body } })
        : await runCreate({ data: body });
      const verb = form.id ? "ההזמנה עודכנה" : "ההזמנה נוצרה";
      if (result?._bookingBlockError) {
        toast.warning(
          `${verb}, אבל שריון הסטודיו נכשל — יתכן שהשעות עדיין פתוחות להזמנה: ${result._bookingBlockError}`,
        );
      } else if (result?._calendarError) {
        toast.warning(`${verb} והסטודיו משוריין באתר, אבל השריון ביומן Google נכשל: ${result._calendarError}`);
      } else if (result?._bookingBlockConfirmed) {
        const c = result._bookingBlockConfirmed;
        toast.success(`${verb}, והסטודיו משוריין: ${c.date} ${c.start}–${c.end}`);
      } else {
        toast.success(`${verb} (בלי תאריך — הסטודיו עדיין לא משוריין)`);
      }
      if (result?._overlap) {
        toast.warning(`שימי לב: השעות חופפות להזמנה קיימת — ${result._overlap}`, { duration: 9000 });
      }
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["studio-custom-orders"] });
    } catch (e) {
      toast.error(heError(e, "השמירה נכשלה"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className={`${hubKind("studio").scope} max-h-[85vh] max-w-lg overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>{form.id ? "עריכת חבילת סטודיו מותאמת" : "חבילת סטודיו מותאמת אישית"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>שם החבילה *</Label>
              <Input value={form.package_name} onChange={(e) => set({ package_name: e.target.value })} />
            </div>
            <div>
              <Label>סכום כולל (₪)</Label>
              <Input type="number" min={0} dir="ltr" value={form.total_price} onChange={(e) => set({ total_price: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>מה כלול (אופציונלי)</Label>
            <Textarea value={form.package_description} onChange={(e) => set({ package_description: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>שם הלקוחה *</Label>
              <Input value={form.contact_name} onChange={(e) => set({ contact_name: e.target.value })} />
            </div>
            <div>
              <Label>טלפון *</Label>
              <Input dir="ltr" value={form.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>מייל</Label>
              <Input dir="ltr" type="email" value={form.contact_email} onChange={(e) => set({ contact_email: e.target.value })} />
            </div>
            <div>
              <Label>תאריך</Label>
              <Input type="date" value={form.session_date} onChange={(e) => set({ session_date: e.target.value })} />
              <DateHints date={form.session_date} sameDayTimes={sameDayTimes(form.session_date, form.id)} />
            </div>
            <div>
              <Label>שעת התחלה</Label>
              <Input type="time" value={form.session_time} onChange={(e) => set({ session_time: e.target.value })} />
            </div>
            <div>
              <Label>משך (שעות)</Label>
              <select className={selectCls} value={form.duration_hours} onChange={(e) => set({ duration_hours: e.target.value })}>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="rounded-xl bg-blush/50 p-3 text-xs text-primary">
            כשיש תאריך ושעה — הסטודיו משוריין אוטומטית לכל משך החבילה, ואי אפשר להזמין אותו באתר באותן שעות.
          </p>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving} className="w-full rounded-full">
            {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
            {form.id ? "שמירה" : "יצירה ושריון הסטודיו"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

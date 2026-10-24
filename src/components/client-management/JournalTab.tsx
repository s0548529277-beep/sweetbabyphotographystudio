import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarPlus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { heError } from "@/lib/he-errors";
import {
  PART_OPTIONS,
  formatDateIL,
  fromYmd,
  hebrewDayLabel,
  holidayFor,
  isRestDay,
  ymd,
  type CmSession,
} from "@/lib/client-management";
import { sendCmPaymentEmail } from "@/lib/client-management.functions";
import { cmDb, findOrCreateClient, useCmInvalidate, type CmData } from "./data";
import { EmptyState, Panel, SessionRow } from "./ui";

type Form = {
  id?: string;
  clientId?: string;
  name: string;
  phone: string;
  email: string;
  date: string;
  time: string;
  type: string;
  slot: string;
  part: string;
  notes: string;
  amount: string;
};

function emptyForm(date: string, type: string): Form {
  return {
    name: "",
    phone: "",
    email: "",
    date,
    time: "09:00",
    type,
    slot: "",
    part: "",
    notes: "",
    amount: "",
  };
}

export type JournalPreset = { date: string; clientId?: string };

export function JournalTab({
  data,
  preset,
  onPresetUsed,
}: {
  data: CmData;
  preset?: JournalPreset | null;
  onPresetUsed?: () => void;
}) {
  const invalidate = useCmInvalidate();
  const sendPayment = useServerFn(sendCmPaymentEmail);
  const today = ymd(new Date());
  const [form, setForm] = useState<Form>(() =>
    emptyForm(today, data.settings.sessionTypes[0] ?? "ניו בורן"),
  );
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    if (!preset) return;
    const c = preset.clientId ? data.clientById.get(preset.clientId) : undefined;
    setForm((f) => ({
      ...emptyForm(preset.date, f.type),
      ...(c
        ? { clientId: c.id, name: c.full_name, phone: c.phone ?? "", email: c.email ?? "" }
        : {}),
    }));
    onPresetUsed?.();
    window.scrollTo({ top: 0, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  // Typing an existing client's name links the session to her and fills her details.
  const onName = (name: string) => {
    const match = data.clients.find((c) => c.full_name.trim() === name.trim());
    if (match)
      set({ name, clientId: match.id, phone: match.phone ?? "", email: match.email ?? "" });
    else set({ name, clientId: undefined });
  };

  const dateObj = form.date ? fromYmd(form.date) : null;
  const holiday = dateObj ? holidayFor(dateObj) : null;
  const restDay = dateObj ? isRestDay(dateObj) : false;
  const sameDay = useMemo(
    () =>
      data.sessions.filter(
        (s) => s.session_date === form.date && s.id !== form.id && s.status !== "cancelled",
      ),
    [data.sessions, form.date, form.id],
  );

  const startEdit = (s: CmSession) => {
    const c = data.clientById.get(s.client_id);
    setForm({
      id: s.id,
      clientId: s.client_id,
      name: c?.full_name ?? "",
      phone: c?.phone ?? "",
      email: c?.email ?? "",
      date: s.session_date,
      time: s.start_time,
      type: s.session_type,
      slot: s.time_slot ?? "",
      part: s.part_label ?? "",
      notes: s.notes ?? "",
      amount: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("חסר שם לקוחה");
    if (!form.date) return toast.error("חסר תאריך");
    if (restDay && !confirm(`${formatDateIL(form.date)} הוא ${holiday ?? "שבת"}. לקבוע בכל זאת?`))
      return;
    setSaving(true);
    try {
      let clientId = form.clientId;
      if (!clientId) {
        clientId = await findOrCreateClient(
          { full_name: form.name, phone: form.phone, email: form.email },
          data.clients,
        );
      } else {
        // Keep the client's contact details current with what was typed here.
        await cmDb
          .from("cm_clients")
          .update({
            phone: form.phone.trim() || null,
            email: form.email.trim().toLowerCase() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", clientId);
      }
      const payload = {
        client_id: clientId,
        session_date: form.date,
        start_time: form.time || "09:00",
        session_type: form.type,
        time_slot: form.slot || null,
        part_label: form.part || null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      let sessionId = form.id;
      if (form.id) {
        // A moved date/time should get a fresh reminder.
        const prev = data.sessions.find((s) => s.id === form.id);
        const moved = prev && (prev.session_date !== form.date || prev.start_time !== form.time);
        const { error } = await cmDb
          .from("cm_sessions")
          .update(moved ? { ...payload, reminder_sent_at: null } : payload)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { data: row, error } = await cmDb
          .from("cm_sessions")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        sessionId = row.id;
      }

      const amount = Number(form.amount);
      if (!form.id && amount > 0) {
        const { data: acc, error } = await cmDb
          .from("cm_payment_accounts")
          .insert({
            client_id: clientId,
            session_id: sessionId,
            title: `צילום ${form.type} · ${formatDateIL(form.date)}`,
            total_amount: amount,
            paid_amount: 0,
          })
          .select("id")
          .single();
        if (error) throw error;
        if (data.settings.paymentEmailOnOpen && form.email.trim()) {
          sendPayment({ data: { accountId: acc.id, kind: "opened" } }).catch(() =>
            toast.error("החשבון נפתח, אבל מייל הסיכום לא נשלח"),
          );
        }
      }

      toast.success(form.id ? "הצילום עודכן" : "הצילום נקבע 💗");
      setForm(emptyForm(today, form.type));
      invalidate();
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data.sessions;
    return data.sessions.filter((s) => {
      const c = data.clientById.get(s.client_id);
      return [c?.full_name, c?.phone, c?.email, s.session_type, s.notes].some((v) =>
        (v ?? "").toLowerCase().includes(term),
      );
    });
  }, [q, data.sessions, data.clientById]);

  const upcoming = filtered.filter((s) => s.session_date >= today && s.status !== "cancelled");
  const history = filtered
    .filter((s) => s.session_date < today || s.status === "cancelled")
    .reverse();
  const historyShown = showAllHistory ? history : history.slice(0, 12);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(320px,400px)_1fr]">
      <Panel
        title={form.id ? "עריכת צילום" : "קביעת צילום"}
        action={
          form.id ? (
            <Button size="sm" variant="ghost" onClick={() => setForm(emptyForm(today, form.type))}>
              <X className="h-4 w-4" /> ביטול עריכה
            </Button>
          ) : null
        }
        className="h-fit lg:sticky lg:top-4"
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div>
            <Label>שם הלקוחה</Label>
            <Input
              list="cm-client-names"
              value={form.name}
              onChange={(e) => onName(e.target.value)}
              placeholder="הקלידי שם — לקוחה קיימת תושלם אוטומטית"
            />
            <datalist id="cm-client-names">
              {data.clients.map((c) => (
                <option key={c.id} value={c.full_name} />
              ))}
            </datalist>
            {form.clientId && !form.id && (
              <p className="mt-1 text-xs text-emerald-700">
                ✓ לקוחה קיימת — הצילום יתווסף לכרטיס שלה
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>טלפון</Label>
              <Input
                dir="ltr"
                value={form.phone}
                onChange={(e) => set({ phone: e.target.value })}
                placeholder="05X-XXXXXXX"
              />
            </div>
            <div>
              <Label>מייל (לתזכורות)</Label>
              <Input
                dir="ltr"
                type="email"
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
                placeholder="name@gmail.com"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>תאריך</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => set({ date: e.target.value })}
              />
            </div>
            <div>
              <Label>שעה</Label>
              <Input
                type="time"
                value={form.time}
                onChange={(e) => set({ time: e.target.value })}
              />
            </div>
          </div>
          {dateObj && (
            <div className="text-xs text-newborn-ink/60">
              {hebrewDayLabel(dateObj)}
              {holiday && (
                <span
                  className={`ms-2 font-medium ${restDay ? "text-destructive" : "text-newborn-gold"}`}
                >
                  · {holiday}
                </span>
              )}
              {dateObj.getDay() === 6 && (
                <span className="ms-2 font-medium text-destructive">· שבת</span>
              )}
              {sameDay.length > 0 && (
                <span className="ms-2 text-amber-700">
                  · כבר {sameDay.length === 1 ? "יש צילום" : `יש ${sameDay.length} צילומים`} ביום
                  הזה ({sameDay.map((s) => s.start_time).join(", ")})
                </span>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>סוג צילום</Label>
              <Select value={form.type} onValueChange={(v) => set({ type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(
                    new Set([...data.settings.sessionTypes, form.type].filter(Boolean)),
                  ).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>מפגש</Label>
              <Select
                value={form.part || "none"}
                onValueChange={(v) => set({ part: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PART_OPTIONS.map((p) => (
                    <SelectItem key={p || "none"} value={p || "none"}>
                      {p || "מפגש יחיד"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>זמן / מיקום</Label>
            <Select
              value={form.slot || "none"}
              onValueChange={(v) => set({ slot: v === "none" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {data.settings.timeSlots.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="אביזרים, צבעים, שם התינוק…"
            />
          </div>
          {!form.id && (
            <div>
              <Label>סכום לתשלום (לא חובה)</Label>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
                placeholder="פותח חשבון תשלום אוטומטית"
              />
            </div>
          )}
          <Button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-newborn-rose text-white hover:bg-newborn-rose/90"
          >
            <CalendarPlus className="h-4 w-4" />{" "}
            {saving ? "שומרת…" : form.id ? "שמירת שינויים" : "קביעת צילום"}
          </Button>
        </form>
      </Panel>

      <div className="space-y-5">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-newborn-ink/40" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש צילום — שם, טלפון, מייל, סוג…"
            className="rounded-full bg-white pr-9"
          />
        </div>
        <Panel title={`צילומים קרובים (${upcoming.length})`}>
          <div className="space-y-2">
            {upcoming.length ? (
              upcoming.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  client={data.clientById.get(s.client_id)}
                  onEdit={startEdit}
                />
              ))
            ) : (
              <EmptyState>אין צילומים קרובים</EmptyState>
            )}
          </div>
        </Panel>
        <Panel title={`היסטוריה (${history.length})`}>
          <div className="space-y-2">
            {historyShown.length ? (
              historyShown.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  client={data.clientById.get(s.client_id)}
                  onEdit={startEdit}
                  compact
                />
              ))
            ) : (
              <EmptyState>עוד אין היסטוריה</EmptyState>
            )}
            {history.length > historyShown.length && (
              <Button variant="ghost" className="w-full" onClick={() => setShowAllHistory(true)}>
                הצגת כל ההיסטוריה ({history.length})
              </Button>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

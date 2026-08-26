import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listPhotoClients,
  createPhotoClient,
  sendPaymentReminderEmails,
  STAGE_LABELS,
  PHOTO_PACKAGES,
  type WorkflowStage,
  type PhotoPackageKey,
} from "@/lib/photo-clients.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Camera, ChevronLeft, ImageIcon, Mail, Search, TriangleAlert, UserPlus, Users, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/photo-clients")({
  component: PhotoClientsAdmin,
});

const STAGE_COLORS: Record<WorkflowStage, string> = {
  booked: "bg-muted text-muted-foreground",
  date_confirmed: "bg-blue-100 text-blue-800",
  proofs_ready: "bg-amber-100 text-amber-800",
  edited_uploaded: "bg-purple-100 text-purple-800",
  album_published: "bg-green-100 text-green-800",
};

type Row = {
  id: string; // photo_client_workflows.id
  booking_id: string | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  session_date: string | null;
  location: string | null;
  package_type: PhotoPackageKey | null;
  photos_to_edit: number | null;
  photo_count: number;
  total_price: number | null;
  amount_paid: number;
  balance: number | null;
  stage: WorkflowStage;
};

const EMPTY_FORM = {
  email: "",
  name: "",
  phone: "",
  sessionDate: "",
  location: "",
  packageType: "" as PhotoPackageKey | "",
  photosToEdit: "",
  albumUpgrades: "",
  sendEmail: true,
};

/** "לקוחה חדשה" — creates a full client card (contact + shoot + package details), no site account required in advance (one gets minted for her if she doesn't have one). */
function NewClientDialog({ onCreated }: { onCreated: (workflowId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const createClient = useServerFn(createPhotoClient);

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Picking a package prefills the photo-count/upgrades text from the price
  // list — still freely editable per-client afterward, since real shoots
  // deviate from the standard tiers all the time.
  const pickPackage = (key: PhotoPackageKey) => {
    const preset = PHOTO_PACKAGES[key];
    setForm((f) => ({
      ...f,
      packageType: key,
      photosToEdit: preset.photosToEdit != null ? String(preset.photosToEdit) : f.photosToEdit,
      albumUpgrades: preset.albumUpgrades || f.albumUpgrades,
    }));
  };

  const submit = async () => {
    if (!form.email.trim()) return toast.error("צריך למלא אימייל");
    setBusy(true);
    try {
      const { workflowId, isNewAccount, tempPassword } = await createClient({
        data: {
          email: form.email.trim(),
          name: form.name.trim() || undefined,
          phone: form.phone.trim() || undefined,
          sessionDate: form.sessionDate || undefined,
          location: form.location.trim() || undefined,
          packageType: form.packageType || undefined,
          photosToEdit: form.photosToEdit.trim() ? Number(form.photosToEdit) : undefined,
          albumUpgrades: form.albumUpgrades.trim() || undefined,
          sendEmail: form.sendEmail,
        },
      });
      setOpen(false);
      setForm(EMPTY_FORM);
      if (isNewAccount) {
        // Shown regardless of sendEmail — the admin needs the code even if
        // she plans to tell the client herself (WhatsApp, in person, ...).
        toast.success(`נפתח חשבון חדש. סיסמה זמנית: ${tempPassword}`, { duration: 15000 });
      }
      onCreated(workflowId);
    } catch (e: any) {
      toast.error(e?.message || "הוספת הלקוחה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" /> לקוחה חדשה
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>לקוחה חדשה</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              אם כבר יש לה חשבון באתר עם המייל הזה — התהליך יתחבר אליו. אם אין — ייפתח לה חשבון חדש אוטומטית, כדי שתוכל בהמשך
              להיכנס עם "שכחתי סיסמה" ולראות את התמונות שלה ב"התמונות שלי".
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">שם</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="שם הלקוחה" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">אימייל *</Label>
                <Input type="email" dir="ltr" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="client@example.com" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">טלפון</Label>
                <Input dir="ltr" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="050-0000000" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">מועד צילומים</Label>
                <Input type="date" value={form.sessionDate} onChange={(e) => set("sessionDate", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs text-muted-foreground">מיקום</Label>
                <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="סטודיו / חוץ / כתובת" />
              </div>
            </div>

            <div className="pt-2 border-t border-border space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">סוג חבילה</Label>
                <Select value={form.packageType || undefined} onValueChange={(v) => pickPackage(v as PhotoPackageKey)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="בחירת חבילה" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(PHOTO_PACKAGES) as [PhotoPackageKey, (typeof PHOTO_PACKAGES)[PhotoPackageKey]][]).map(([key, p]) => (
                      <SelectItem key={key} value={key}>
                        {p.label}
                        {p.price != null ? ` — ₪${p.price}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">כמות תמונות לעיבוד</Label>
                <Input type="number" min={0} dir="ltr" value={form.photosToEdit} onChange={(e) => set("photosToEdit", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">אלבום ושדרוגים</Label>
                <Input value={form.albumUpgrades} onChange={(e) => set("albumUpgrades", e.target.value)} placeholder="אלבום דיגיטלי, כריכת בוק, וכו׳" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox checked={form.sendEmail} onCheckedChange={(v) => set("sendEmail", !!v)} />
              <Label className="text-xs text-muted-foreground font-normal cursor-pointer" onClick={() => set("sendEmail", !form.sendEmail)}>
                לשלוח מייל ללקוחה שנפתח לה חשבון (רק אם באמת נפתח חשבון חדש — סיסמה זמנית: 1234)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={submit} disabled={busy} className="rounded-full">
              {busy ? "יוצר..." : "יצירה והמשך להעלאת תמונות"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const PAYMENT_FILTERS = [
  { key: "all", label: "הכל" },
  { key: "open", label: "יתרה פתוחה" },
  { key: "paid", label: "שולם במלואו" },
] as const;
type PaymentFilter = (typeof PAYMENT_FILTERS)[number]["key"];

/** "תשלומי לקוחות" tab — stat tiles, filterable list with a paid/total progress bar per client, and a bulk "מייל תשלום ללקוחות" action. Only clients with a total_price set show up here (no price entered = nothing to track yet). */
function PaymentsView({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const sendReminders = useServerFn(sendPaymentReminderEmails);

  const priced = rows.filter((r) => r.total_price != null);
  const totalPaid = priced.reduce((s, r) => s + r.amount_paid, 0);
  const totalOpen = priced.reduce((s, r) => s + Math.max(0, r.balance ?? 0), 0);

  const filteredRows = priced.filter((r) => {
    if (filter === "open") return (r.balance ?? 0) > 0;
    if (filter === "paid") return (r.balance ?? 0) <= 0;
    return true;
  });

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
      const { results } = await sendReminders({ data: { workflowIds: Array.from(selected) } });
      const sentCount = results.filter((r) => r.sent).length;
      const skipped = results.filter((r) => !r.sent);
      if (sentCount > 0) toast.success(`נשלחו ${sentCount} מיילים`);
      if (skipped.length > 0) {
        toast.error(`${skipped.length} לא נשלחו: ${skipped.map((s) => s.reason).join(", ")}`, { duration: 8000 });
      }
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? "השליחה נכשלה");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl border border-primary/10 p-4 text-center">
          <p className="font-display text-2xl text-primary">₪{totalPaid.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground mt-1">שולם סה״כ</p>
        </div>
        <div className="bg-card rounded-2xl border border-primary/10 p-4 text-center">
          <p className="font-display text-2xl text-peach-deep">₪{totalOpen.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground mt-1">יתרה פתוחה</p>
        </div>
        <div className="bg-card rounded-2xl border border-primary/10 p-4 text-center">
          <p className="font-display text-2xl text-primary">{priced.length}</p>
          <p className="text-xs text-muted-foreground mt-1">הזמנות עם מחיר</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {PAYMENT_FILTERS.map((f) => (
            <Button
              key={f.key}
              type="button"
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <Button type="button" size="sm" variant="outline" className="rounded-full gap-1.5" disabled={sending || selected.size === 0} onClick={sendToSelected}>
          <Mail className="h-3.5 w-3.5" /> {sending ? "שולח..." : `מייל תשלום ללקוחות (${selected.size})`}
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-primary/10 divide-y divide-primary/5">
        {filteredRows.map((r) => {
          const total = r.total_price ?? 0;
          const pct = total > 0 ? Math.min(100, Math.round((r.amount_paid / total) * 100)) : 0;
          const paidInFull = (r.balance ?? 0) <= 0;
          return (
            <div key={r.id} className="flex items-center gap-3 p-4">
              <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} disabled={paidInFull} />
              <Link to="/admin/photo-clients/$bookingId" params={{ bookingId: r.id }} className="flex-1 min-w-0 hover:opacity-80">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{r.contact_name}</p>
                  {paidInFull ? (
                    <span className="text-xs text-green-700 flex items-center gap-1 shrink-0">שולם</span>
                  ) : (
                    <span className="text-xs text-peach-deep shrink-0">יתרה ₪{(r.balance ?? 0).toFixed(0)}</span>
                  )}
                </div>
                <div className="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
                  <div className={`h-full rounded-full ${paidInFull ? "bg-green-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1" dir="ltr">
                  ₪{r.amount_paid.toFixed(0)} / ₪{total.toFixed(0)}
                </p>
              </Link>
            </div>
          );
        })}
        {filteredRows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">
            {priced.length === 0 ? 'אין עדיין לקוחות עם "סכום כולל" מוגדר (מוגדר בעמוד הפרטים של כל לקוחה).' : "אין תוצאות למסנן הזה."}
          </p>
        )}
      </div>
    </div>
  );
}

function PhotoClientsAdmin() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"clients" | "payments">("clients");
  const fetchClients = useServerFn(listPhotoClients);
  const clients = useQuery({ queryKey: ["photo-clients"], queryFn: () => fetchClients({}) });
  const rows = (clients.data ?? []) as unknown as Row[];
  const filtered = rows.filter(
    (r) => !q.trim() || r.contact_name.toLowerCase().includes(q.trim().toLowerCase()) || r.contact_email.toLowerCase().includes(q.trim().toLowerCase()),
  );

  const onWorkflowCreated = (workflowId: string) => {
    qc.invalidateQueries({ queryKey: ["photo-clients"] });
    navigate({ to: "/admin/photo-clients/$bookingId", params: { bookingId: workflowId } });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-primary mb-1 flex items-center gap-2">
            <Camera className="h-5 w-5" /> לקוחות צילום
          </h2>
          <p className="text-sm text-muted-foreground">
            כל לקוחה שהזמינה צילומים עם מיכל, וכל לקוחה שהתחלת לה תהליך ידנית — מעקב אחר שלב מסירת התמונות שלה.
          </p>
        </div>
        <NewClientDialog onCreated={onWorkflowCreated} />
      </div>

      <div className="flex gap-2">
        <Button type="button" size="sm" variant={view === "clients" ? "default" : "outline"} className="rounded-full gap-1.5" onClick={() => setView("clients")}>
          <Users className="h-3.5 w-3.5" /> לקוחות
        </Button>
        <Button type="button" size="sm" variant={view === "payments" ? "default" : "outline"} className="rounded-full gap-1.5" onClick={() => setView("payments")}>
          <Wallet className="h-3.5 w-3.5" /> תשלומים
        </Button>
      </div>

      {/* A failed fetch used to render exactly like "no clients yet" — surfacing
          the real error here so a genuine bug (RLS, permissions, ...) doesn't
          look identical to an empty-but-fine list. */}
      {clients.isError && (
        <div className="bg-destructive/10 text-destructive rounded-2xl border border-destructive/20 p-4 flex items-start gap-2 text-sm">
          <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">טעינת רשימת הלקוחות נכשלה — זו הסיבה שהרשימה נראית ריקה</p>
            {/* Raw error text on purpose (not heError) — this is an admin
                diagnostic, not customer-facing copy, so the real message
                (RLS/permissions/etc.) matters more than Hebrew-only polish. */}
            <p className="mt-0.5" dir="ltr">
              {(clients.error as any)?.message ?? String(clients.error)}
            </p>
          </div>
        </div>
      )}

      {view === "payments" ? (
        <PaymentsView rows={rows} />
      ) : (
        <>
          {rows.length > 0 && (
            <div className="relative max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם או אימייל..." className="pr-9" />
            </div>
          )}

          <div className="bg-card rounded-2xl border border-primary/10 divide-y divide-primary/5">
            {filtered.map((r) => (
              <Link
                key={r.id}
                to="/admin/photo-clients/$bookingId"
                params={{ bookingId: r.id }}
                className="flex items-center justify-between gap-3 p-4 hover:bg-cream/30 transition"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.contact_name}</p>
                  {r.contact_email && (
                    <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                      {r.contact_email}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                    {r.contact_phone} {r.session_date ? `· ${r.session_date}` : "· אין מועד"}
                    {r.location ? ` · ${r.location}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {r.package_type && <span className="text-xs text-muted-foreground">{PHOTO_PACKAGES[r.package_type].label}</span>}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <ImageIcon className="h-3.5 w-3.5" /> {r.photo_count}
                  </span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STAGE_COLORS[r.stage]}`}>{STAGE_LABELS[r.stage]}</span>
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
            {!clients.isError && rows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">אין עדיין לקוחות צילום. אפשר להוסיף "לקוחה חדשה" למעלה.</p>
            )}
            {!clients.isError && rows.length > 0 && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">אין תוצאות לחיפוש "{q}".</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

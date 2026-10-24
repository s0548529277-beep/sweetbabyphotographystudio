import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  Download,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Save,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { heError } from "@/lib/he-errors";
import { balanceOf, shekel, whatsappLink, ymd, type CmClient } from "@/lib/client-management";
import { cmDb, findOrCreateClient, useCmInvalidate, type CmData } from "./data";
import { AccountRow, PaymentDialog, accountToForm } from "./PaymentsTab";
import type { JournalPreset } from "./JournalTab";
import { EmptyState, Panel, SessionRow } from "./ui";

export function ClientsTab({ data, onBook }: { data: CmData; onBook: (p: JournalPreset) => void }) {
  const invalidate = useCmInvalidate();
  const [newClient, setNewClient] = useState({ full_name: "", email: "", phone: "" });
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!newClient.full_name.trim()) return toast.error("חסר שם");
    setAdding(true);
    try {
      const before = data.clients.length;
      const id = await findOrCreateClient(newClient, data.clients);
      toast.success(
        data.clients.some((c) => c.id === id) ? "הלקוחה כבר קיימת ברשימה" : "הלקוחה נוספה",
      );
      setNewClient({ full_name: "", email: "", phone: "" });
      invalidate("clients");
      if (before) setOpenId(id);
    } catch (e) {
      toast.error(heError(e));
    } finally {
      setAdding(false);
    }
  };

  const stats = useMemo(() => {
    const m = new Map<
      string,
      { sessions: number; next?: string; balance: number; accounts: number }
    >();
    const today = ymd(new Date());
    for (const c of data.clients) m.set(c.id, { sessions: 0, balance: 0, accounts: 0 });
    for (const s of data.sessions) {
      const st = m.get(s.client_id);
      if (!st) continue;
      st.sessions++;
      if (
        s.session_date >= today &&
        s.status !== "cancelled" &&
        (!st.next || s.session_date < st.next)
      )
        st.next = s.session_date;
    }
    for (const a of data.accounts) {
      const st = m.get(a.client_id);
      if (!st) continue;
      st.accounts++;
      st.balance += balanceOf(a);
    }
    return m;
  }, [data.clients, data.sessions, data.accounts]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data.clients;
    return data.clients.filter((c) =>
      [c.full_name, c.email, c.phone, c.baby_name, c.notes].some((v) =>
        (v ?? "").toLowerCase().includes(term),
      ),
    );
  }, [q, data.clients]);

  const exportCsv = () => {
    const rows = [
      [
        "שם",
        "טלפון",
        "מייל",
        "שם התינוק/ת",
        "תאריך לידה",
        "איך הגיעה",
        "צילומים",
        "יתרה פתוחה",
        "הערות",
      ],
    ];
    for (const c of data.clients) {
      const st = stats.get(c.id);
      rows.push([
        c.full_name,
        c.phone ?? "",
        c.email ?? "",
        c.baby_name ?? "",
        c.birth_date ?? "",
        c.source ?? "",
        String(st?.sessions ?? 0),
        String(st?.balance ?? 0),
        c.notes ?? "",
      ]);
    }
    const csv =
      "﻿" +
      rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `לקוחות-${ymd(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-newborn-rose" /> לקוחה חדשה
          </span>
        }
      >
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            value={newClient.full_name}
            onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })}
            placeholder="שם מלא"
          />
          <Input
            dir="ltr"
            type="email"
            value={newClient.email}
            onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
            placeholder="name@gmail.com"
          />
          <Input
            dir="ltr"
            value={newClient.phone}
            onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
            placeholder="05X-XXXXXXX"
          />
          <Button
            type="submit"
            disabled={adding}
            className="rounded-full bg-newborn-rose text-white hover:bg-newborn-rose/90"
          >
            <Plus className="h-4 w-4" /> הוספה
          </Button>
        </form>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-newborn-ink/40" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי שם, מייל, טלפון…"
            className="rounded-full bg-white pr-9"
          />
        </div>
        <span className="text-sm text-newborn-ink/60">{list.length} לקוחות</span>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={exportCsv}
          disabled={!data.clients.length}
        >
          <Download className="h-4 w-4" /> ייצוא לאקסל
        </Button>
      </div>

      <div className="space-y-2">
        {list.map((c) => {
          const st = stats.get(c.id)!;
          const open = openId === c.id;
          return (
            <div
              key={c.id}
              className="overflow-hidden rounded-3xl border border-newborn-rose/15 bg-white"
            >
              <button
                className="flex w-full items-center gap-3 px-4 py-3 text-right"
                onClick={() => setOpenId(open ? null : c.id)}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-newborn-blush to-newborn-rose/40 font-semibold text-newborn-ink">
                  {c.full_name.trim().charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-newborn-ink">{c.full_name}</span>
                  <span className="block truncate text-xs text-newborn-ink/55" dir="ltr">
                    {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <span className="hidden items-center gap-1.5 text-xs sm:flex">
                  <span className="rounded-full bg-newborn-canvas px-2 py-0.5">
                    📅 {st.sessions}
                  </span>
                  {st.next && (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-800">
                      הבא: {st.next.split("-").reverse().join(".")}
                    </span>
                  )}
                  {st.balance > 0 && (
                    <span className="rounded-full bg-newborn-blush px-2 py-0.5 text-newborn-rose">
                      {shekel(st.balance)}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`}
                />
              </button>
              {open && (
                <ClientDetails
                  client={c}
                  data={data}
                  onBook={onBook}
                  onDeleted={() => setOpenId(null)}
                />
              )}
            </div>
          );
        })}
        {!list.length && (
          <EmptyState>
            {data.clients.length
              ? "לא נמצאו לקוחות בחיפוש"
              : "עוד אין לקוחות — הוסיפי את הראשונה למעלה"}
          </EmptyState>
        )}
      </div>
    </div>
  );
}

function ClientDetails({
  client,
  data,
  onBook,
  onDeleted,
}: {
  client: CmClient;
  data: CmData;
  onBook: (p: JournalPreset) => void;
  onDeleted: () => void;
}) {
  const invalidate = useCmInvalidate();
  const [f, setF] = useState({
    full_name: client.full_name,
    email: client.email ?? "",
    phone: client.phone ?? "",
    baby_name: client.baby_name ?? "",
    birth_date: client.birth_date ?? "",
    source: client.source ?? "",
    notes: client.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payInitial, setPayInitial] = useState<any>(undefined);
  const sessions = data.sessions
    .filter((s) => s.client_id === client.id)
    .sort((a, b) => b.session_date.localeCompare(a.session_date));
  const accounts = data.accounts.filter((a) => a.client_id === client.id);
  const wa = whatsappLink(client.phone);

  const save = async () => {
    if (!f.full_name.trim()) return toast.error("חסר שם");
    setSaving(true);
    const { error } = await cmDb
      .from("cm_clients")
      .update({
        full_name: f.full_name.trim(),
        email: f.email.trim().toLowerCase() || null,
        phone: f.phone.trim() || null,
        baby_name: f.baby_name.trim() || null,
        birth_date: f.birth_date || null,
        source: f.source.trim() || null,
        notes: f.notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", client.id);
    setSaving(false);
    if (error) return toast.error(heError(error));
    toast.success("הפרטים נשמרו");
    invalidate("clients");
  };

  const remove = async () => {
    if (!confirm(`למחוק את ${client.full_name} יחד עם כל הצילומים והחשבונות שלה? אי אפשר לבטל.`))
      return;
    const { error } = await cmDb.from("cm_clients").delete().eq("id", client.id);
    if (error) return toast.error(heError(error));
    toast.success("הלקוחה נמחקה");
    onDeleted();
    invalidate();
  };

  return (
    <div className="space-y-5 border-t border-newborn-rose/10 bg-newborn-canvas/30 p-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="rounded-full bg-newborn-rose text-white hover:bg-newborn-rose/90"
          onClick={() => onBook({ date: ymd(new Date()), clientId: client.id })}
        >
          <Plus className="h-4 w-4" /> צילום חדש
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={() => {
            setPayInitial({ client_id: client.id });
            setPayOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> חשבון תשלום
        </Button>
        {wa && (
          <Button size="sm" variant="outline" className="rounded-full" asChild>
            <a href={wa} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4 text-emerald-600" /> וואטסאפ
            </a>
          </Button>
        )}
        {client.phone && (
          <Button size="sm" variant="outline" className="rounded-full" asChild>
            <a href={`tel:${client.phone}`}>
              <Phone className="h-4 w-4" /> חיוג
            </a>
          </Button>
        )}
        {client.email && (
          <Button size="sm" variant="outline" className="rounded-full" asChild>
            <a href={`mailto:${client.email}`}>
              <Mail className="h-4 w-4" /> מייל
            </a>
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>שם מלא</Label>
          <Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        </div>
        <div>
          <Label>מייל</Label>
          <Input
            dir="ltr"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </div>
        <div>
          <Label>טלפון</Label>
          <Input
            dir="ltr"
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
          />
        </div>
        <div>
          <Label>שם התינוק/ת</Label>
          <Input value={f.baby_name} onChange={(e) => setF({ ...f, baby_name: e.target.value })} />
        </div>
        <div>
          <Label>תאריך לידה</Label>
          <Input
            type="date"
            value={f.birth_date}
            onChange={(e) => setF({ ...f, birth_date: e.target.value })}
          />
        </div>
        <div>
          <Label>איך הגיעה אלינו</Label>
          <Input
            value={f.source}
            onChange={(e) => setF({ ...f, source: e.target.value })}
            placeholder="סל לידה, המלצה, אינסטגרם…"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Label>הערות</Label>
          <Textarea
            rows={2}
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
          />
        </div>
      </div>
      <div className="flex justify-between gap-2">
        <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}>
          <Trash2 className="h-4 w-4" /> מחיקת לקוחה
        </Button>
        <Button size="sm" onClick={save} disabled={saving} className="rounded-full">
          <Save className="h-4 w-4" /> שמירת פרטים
        </Button>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-newborn-ink">צילומים ({sessions.length})</h4>
        <div className="space-y-2">
          {sessions.length ? (
            sessions.map((s) => <SessionRow key={s.id} session={s} client={client} compact />)
          ) : (
            <EmptyState>אין צילומים</EmptyState>
          )}
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-newborn-ink">תשלומים ({accounts.length})</h4>
        <div className="grid gap-2 md:grid-cols-2">
          {accounts.map((a) => (
            <AccountRow
              key={a.id}
              a={a}
              data={data}
              onEdit={(acc) => {
                setPayInitial(accountToForm(acc));
                setPayOpen(true);
              }}
            />
          ))}
        </div>
        {!accounts.length && <EmptyState>אין חשבונות תשלום</EmptyState>}
      </div>
      <PaymentDialog data={data} open={payOpen} onOpenChange={setPayOpen} initial={payInitial} />
    </div>
  );
}

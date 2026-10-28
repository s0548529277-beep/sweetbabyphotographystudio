import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Target, Plus, MessageCircle, Mail, Phone } from "lucide-react";

// Inquiry leads (table public.inquiry_leads — NOT public.leads, which is the
// older newsletter sign-up table). Filled automatically every hour by the
// scheduled email assistant (Claude) via the upsert_lead_from_assistant RPC
// — see drizzle/migrations/0023_inquiry_leads.sql — and editable here.

export const Route = createFileRoute("/_authenticated/admin/leads")({
  component: LeadsAdmin,
});

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  topic: string;
  message: string | null;
  status: string;
  referred_to_shulamit: boolean;
  first_contact_at: string;
  last_contact_at: string | null;
  follow_up_sent_at: string | null;
  gmail_thread_id: string | null;
  notes: string | null;
  created_at: string;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "חדשה – לא נענתה", cls: "bg-rose-100 text-rose-800" },
  replied: { label: "נענתה", cls: "bg-sky-100 text-sky-800" },
  follow_up: { label: "נשלח מעקב", cls: "bg-amber-100 text-amber-800" },
  booked: { label: "סגרה ✓", cls: "bg-emerald-100 text-emerald-800" },
  not_relevant: { label: "לא רלוונטי", cls: "bg-stone-200 text-stone-600" },
};

const TOPIC: Record<string, string> = {
  newborn: "ניו בורן",
  birth_basket: "סל לידה",
  upsherin: "חלאקה",
  family: "משפחה / ילדים",
  outdoor: "צילומי חוץ",
  studio: "השכרת סטודיו",
  props: "השכרת אביזרים",
  other: "אחר",
};

const SOURCE: Record<string, string> = {
  email: "מייל",
  site_form: "טופס באתר",
  whatsapp: "וואטסאפ",
  phone: "טלפון",
  shulamit: "דרך שולמית",
  other: "אחר",
};

// Written into notes by email-drafts.server.ts (DRAFT_READY_NOTE) when the
// assistant prepared a Gmail draft that she hasn't sent yet.
const DRAFT_READY_NOTE = "✍️ הוכנה טיוטה (לא נשלחה)";

type DraftsStatus = {
  at?: string;
  account?: string;
  created?: number;
  skipped?: number;
  errors?: string[];
  reason?: string;
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("he-IL") : "—");

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

function LeadsAdmin() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", phone: "", email: "", topic: "newborn", source: "phone", message: "" });

  const leads = useQuery({
    queryKey: ["admin-inquiry-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inquiry_leads" as never)
        .select("*")
        .order("first_contact_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as Lead[];
    },
    refetchInterval: 60000,
  });

  const draftsStatus = useQuery({
    queryKey: ["admin-email-drafts-status"],
    queryFn: async (): Promise<DraftsStatus | null> => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", "email_drafts_status")
        .maybeSingle();
      try {
        return data?.value ? (JSON.parse(data.value) as DraftsStatus) : null;
      } catch {
        return null;
      }
    },
    refetchInterval: 60000,
  });

  const all = leads.data ?? [];

  const counts = useMemo(() => {
    const c = { new: 0, replied: 0, follow_up: 0, booked: 0, not_relevant: 0 } as Record<
      "new" | "replied" | "follow_up" | "booked" | "not_relevant",
      number
    >;
    for (const l of all) if (l.status in c) c[l.status as keyof typeof c] += 1;
    return { ...c, total: all.length, conversion: all.length ? Math.round((c.booked / all.length) * 100) : 0 };
  }, [all]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((l) => {
      if (statusFilter === "open" && !["new", "replied", "follow_up"].includes(l.status)) return false;
      if (statusFilter !== "open" && statusFilter !== "all" && l.status !== statusFilter) return false;
      if (topicFilter !== "all" && l.topic !== topicFilter) return false;
      if (q && !`${l.name ?? ""} ${l.email ?? ""} ${l.phone ?? ""} ${l.message ?? ""} ${l.notes ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [all, statusFilter, topicFilter, search]);

  const update = async (id: string, patch: Partial<Lead>) => {
    const { error } = await supabase
      .from("inquiry_leads" as never)
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-inquiry-leads"] });
  };

  const addLead = async () => {
    if (!draft.name.trim() && !draft.phone.trim() && !draft.email.trim()) return toast.error("צריך לפחות שם, טלפון או מייל");
    const { error } = await supabase.from("inquiry_leads" as never).insert({
      name: draft.name || null,
      phone: draft.phone || null,
      email: draft.email || null,
      topic: draft.topic,
      source: draft.source,
      message: draft.message || null,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("הליד נוסף");
    setDraft({ name: "", phone: "", email: "", topic: "newborn", source: "phone", message: "" });
    setAdding(false);
    qc.invalidateQueries({ queryKey: ["admin-inquiry-leads"] });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-primary flex items-center gap-2">
          <Target className="h-5 w-5" /> לידים ופניות
        </h2>
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4 ml-1" /> ליד ידני
        </Button>
      </div>
      <p className="text-sm text-forest/70">
        כל פנייה שמגיעה במייל, בטופס באתר או דרך שולמית נרשמת כאן אוטומטית (בדיקה כל שעה) ומתעדכנת כשעונים / שולחים מעקב.
        אפשר לשנות סטטוס ולהוסיף הערות ידנית.
      </p>

      {/* Email drafts assistant — last run */}
      {draftsStatus.data && (
        <div
          className={`rounded-2xl border p-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1 ${
            draftsStatus.data.errors?.length || draftsStatus.data.reason === "no_gmail"
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-primary/10 bg-card text-forest/80"
          }`}
        >
          <span className="font-medium">✍️ עוזר הטיוטות</span>
          <span>
            בדיקה אחרונה:{" "}
            {draftsStatus.data.at
              ? new Date(draftsStatus.data.at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })
              : "—"}
          </span>
          {draftsStatus.data.reason === "no_gmail" ? (
            <span>אין חשבון ג׳ימייל מחובר לאתר</span>
          ) : (
            <>
              <span>הוכנו בבדיקה הזו: {draftsStatus.data.created ?? 0}</span>
              {draftsStatus.data.errors?.length ? (
                <span title={draftsStatus.data.errors.join("\n")}>תקלות: {draftsStatus.data.errors.length}</span>
              ) : (
                <span>בלי תקלות</span>
              )}
            </>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { k: "all", label: "סה״כ פניות", v: counts.total },
          { k: "new", label: "לא נענו", v: counts.new },
          { k: "replied", label: "נענו", v: counts.replied },
          { k: "follow_up", label: "נשלח מעקב", v: counts.follow_up },
          { k: "booked", label: "סגרו", v: counts.booked },
          { k: "conv", label: "אחוז סגירה", v: `${counts.conversion}%` },
        ].map((c) => (
          <button
            key={c.k}
            type="button"
            onClick={() => c.k !== "conv" && setStatusFilter(c.k)}
            className={`bg-card rounded-2xl border p-4 text-right transition-colors ${
              statusFilter === c.k ? "border-primary/40 ring-1 ring-primary/20" : "border-primary/5 hover:border-primary/20"
            }`}
          >
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="font-display text-2xl text-primary mt-1">{c.v}</div>
          </button>
        ))}
      </div>

      {adding && (
        <div className="bg-card rounded-2xl border border-primary/10 p-4 grid sm:grid-cols-3 gap-3">
          <Input placeholder="שם" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Input placeholder="טלפון" dir="ltr" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          <Input placeholder="מייל" dir="ltr" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          <select className="border rounded-md h-10 px-2 bg-background" value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })}>
            {Object.entries(TOPIC).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select className="border rounded-md h-10 px-2 bg-background" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })}>
            {Object.entries(SOURCE).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <Input placeholder="מה ביקשה" value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
          <div className="sm:col-span-3 flex gap-2">
            <Button onClick={addLead}>שמירה</Button>
            <Button variant="outline" onClick={() => setAdding(false)}>ביטול</Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select className="border rounded-md h-9 px-2 bg-background text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="open">פתוחות (לא סגרו)</option>
          <option value="all">הכל</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select className="border rounded-md h-9 px-2 bg-background text-sm" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
          <option value="all">כל הנושאים</option>
          {Object.entries(TOPIC).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <Input className="h-9 max-w-xs" placeholder="חיפוש שם / טלפון / מייל" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="bg-card rounded-2xl border border-primary/5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream/60 text-right">
            <tr>
              <th className="p-3 font-medium">פנתה</th>
              <th className="p-3 font-medium">שם וקשר</th>
              <th className="p-3 font-medium">נושא</th>
              <th className="p-3 font-medium">מקור</th>
              <th className="p-3 font-medium min-w-[220px]">מה ביקשה</th>
              <th className="p-3 font-medium">סטטוס</th>
              <th className="p-3 font-medium">קשר אחרון / מעקב</th>
              <th className="p-3 font-medium min-w-[200px]">הערות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="border-t border-primary/5 align-top">
                <td className="p-3 whitespace-nowrap text-forest/70">{fmt(l.first_contact_at)}</td>
                <td className="p-3">
                  <div className="font-medium text-primary">{l.name || "—"}</div>
                  <div className="flex gap-2 mt-1 text-forest/70">
                    {l.phone && (
                      <a href={waLink(l.phone)} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary" dir="ltr">
                        <MessageCircle className="h-3.5 w-3.5" /> {l.phone}
                      </a>
                    )}
                    {!l.phone && <Phone className="h-3.5 w-3.5 opacity-30" />}
                  </div>
                  {l.email && (
                    <a href={`mailto:${l.email}`} className="flex items-center gap-1 text-xs text-forest/60 hover:text-primary mt-1" dir="ltr">
                      <Mail className="h-3 w-3" /> {l.email}
                    </a>
                  )}
                </td>
                <td className="p-3">
                  <select
                    className="border rounded-md h-8 px-1 bg-background text-xs"
                    value={l.topic}
                    onChange={(e) => update(l.id, { topic: e.target.value })}
                  >
                    {Object.entries(TOPIC).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  {l.referred_to_shulamit && <div className="text-[11px] text-forest/60 mt-1">הועברה לשולמית</div>}
                </td>
                <td className="p-3 text-forest/70 whitespace-nowrap">{SOURCE[l.source] ?? l.source}</td>
                <td className="p-3 text-forest/80 text-xs leading-relaxed">{l.message || "—"}</td>
                <td className="p-3">
                  <select
                    className={`rounded-full h-8 px-2 text-xs border-0 ${STATUS[l.status]?.cls ?? ""}`}
                    value={l.status}
                    onChange={(e) => update(l.id, { status: e.target.value })}
                  >
                    {Object.entries(STATUS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                  {l.status === "new" && l.notes?.includes(DRAFT_READY_NOTE) && (
                    <div className="text-[11px] text-amber-700 mt-1">טיוטה מחכה בג׳ימייל – עוד לא נשלחה</div>
                  )}
                </td>
                <td className="p-3 text-xs text-forest/70 whitespace-nowrap">
                  <div>{fmt(l.last_contact_at)}</div>
                  {l.follow_up_sent_at && <div className="text-amber-700">מעקב: {fmt(l.follow_up_sent_at)}</div>}
                </td>
                <td className="p-3">
                  <textarea
                    defaultValue={l.notes ?? ""}
                    rows={2}
                    className="w-full border rounded-md p-1.5 text-xs bg-background"
                    onBlur={(e) => {
                      if ((e.target.value || null) !== (l.notes || null)) update(l.id, { notes: e.target.value || null });
                    }}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-forest/60">
                  {leads.isLoading ? "טוען…" : "אין לידים בסינון הזה"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

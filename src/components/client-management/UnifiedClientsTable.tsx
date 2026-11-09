import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { listPhotoClients, PHOTO_PACKAGES, STAGE_LABELS } from "@/lib/photo-clients.functions";
import { findNewbornPackage } from "@/lib/newborn-packages";
import { formatDateIL, shekel } from "@/lib/client-management";
import type { CmData } from "./data";
import { EmptyState, Panel } from "./ui";

/**
 * ONE table with every client from every track (owner request 2026-11-09:
 * "unify the tables in client management, the main screen shows data from all"):
 * newborn packages, outdoor packages, general photo clients, photo-delivery-only
 * clients and the journal clients (cm_clients). Each row opens its own page.
 */
type Track = "ניו-בורן" | "צילומי חוץ" | "צילום כללי" | "שליחת תמונות" | "יומן";

type Row = {
  key: string;
  track: Track;
  name: string;
  phone: string;
  email: string;
  date: string | null;
  time: string;
  pkg: string;
  total: number;
  paid: number;
  status: string;
  to?: string;
  params?: Record<string, string>;
  /** Journal rows have no page of their own — they open the "לקוחות" tab. */
  cmClient?: boolean;
};

const TRACK_TONE: Record<Track, string> = {
  "ניו-בורן": "bg-amber-100 text-amber-800",
  "צילומי חוץ": "bg-emerald-100 text-emerald-800",
  "צילום כללי": "bg-sky-100 text-sky-800",
  "שליחת תמונות": "bg-violet-100 text-violet-800",
  "יומן": "bg-newborn-blush/70 text-newborn-ink",
};

const TRACKS: Track[] = ["ניו-בורן", "צילומי חוץ", "צילום כללי", "שליחת תמונות", "יומן"];
const PAGE = 40;

function ymdNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function simpleStatus(date: string | null, delivered: boolean, today: string) {
  if (delivered) return "נמסר";
  if (!date) return "טרם נקבע";
  return date >= today ? "נקבע" : "בעבודה";
}

export function UnifiedClientsTable({ data, onOpenCmClient }: { data: CmData; onOpenCmClient?: () => void }) {
  const navigate = useNavigate();
  const fetchPhoto = useServerFn(listPhotoClients);
  const photo = useQuery({ queryKey: ["photo-clients"], queryFn: () => fetchPhoto({}) });
  const outdoor = useQuery({
    queryKey: ["outdoor-orders-overview"],
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("outdoor_package_orders")
        .select(
          "id, contact_name, contact_phone, contact_email, session_date, session_time, package_name, total_price, amount_paid, delivered_at",
        )
        .order("session_date", { ascending: true });
      if (error) throw new Error(error.message);
      return (rows ?? []) as any[];
    },
  });

  const [q, setQ] = useState("");
  const [track, setTrack] = useState<Track | "all">("all");
  const [when, setWhen] = useState<"all" | "upcoming" | "past">("all");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const today = ymdNow();

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const o of data.newborn) {
      out.push({
        key: `nb-${o.id}`,
        track: "ניו-בורן",
        name: o.contact_name,
        phone: o.contact_phone ?? "",
        email: o.contact_email ?? "",
        date: o.session_date ?? null,
        time: (o.session_time ?? "").slice(0, 5),
        pkg: (findNewbornPackage(o.package_id) as any)?.name ?? "",
        total: Number(o.total_price ?? 0),
        paid: Number(o.amount_paid ?? 0),
        status: simpleStatus(o.session_date ?? null, !!o.delivered_at, today),
        to: "/admin/newborn-packages/$orderId",
        params: { orderId: o.id },
      });
    }
    for (const o of outdoor.data ?? []) {
      out.push({
        key: `out-${o.id}`,
        track: "צילומי חוץ",
        name: o.contact_name,
        phone: o.contact_phone ?? "",
        email: o.contact_email ?? "",
        date: o.session_date ?? null,
        time: (o.session_time ?? "").slice(0, 5),
        pkg: o.package_name ?? "",
        total: Number(o.total_price ?? 0),
        paid: Number(o.amount_paid ?? 0),
        status: simpleStatus(o.session_date ?? null, !!o.delivered_at, today),
        to: "/admin/outdoor-packages/$orderId",
        params: { orderId: o.id },
      });
    }
    for (const r of (photo.data ?? []) as any[]) {
      const sendOnly = !r.has_package && r.wants_editing === false;
      out.push({
        key: `ph-${r.id}`,
        track: sendOnly ? "שליחת תמונות" : "צילום כללי",
        name: r.contact_name,
        phone: r.contact_phone && r.contact_phone !== "—" ? r.contact_phone : "",
        email: r.contact_email ?? "",
        date: r.session_date ? String(r.session_date).slice(0, 10) : null,
        time: String(r.session_time ?? "").slice(0, 5),
        pkg: r.package_type ? ((PHOTO_PACKAGES as Record<string, { label: string }>)[r.package_type]?.label ?? String(r.package_type)) : "",
        total: Number(r.total_price ?? 0),
        paid: Number(r.amount_paid ?? 0),
        status: (STAGE_LABELS as Record<string, string>)[r.stage] ?? "",
        to: "/admin/photo-clients/$bookingId",
        params: { bookingId: r.id },
      });
    }
    // Journal clients: one row per client — her next session (else the latest one) + all her payment accounts.
    for (const c of data.clients) {
      const mine = data.sessions.filter((s) => s.client_id === c.id && s.status !== "cancelled");
      const next = mine.filter((s) => s.session_date >= today)[0];
      const last = [...mine].reverse()[0];
      const s = next ?? last;
      const accs = data.accounts.filter((a) => a.client_id === c.id);
      out.push({
        key: `cm-${c.id}`,
        track: "יומן",
        name: c.full_name,
        phone: c.phone ?? "",
        email: c.email ?? "",
        date: s?.session_date ?? null,
        time: (s?.start_time ?? "").slice(0, 5),
        pkg: s?.session_type ?? "",
        total: accs.reduce((n, a) => n + a.total_amount, 0),
        paid: accs.reduce((n, a) => n + a.paid_amount, 0),
        status: s ? (s.status === "delivered" ? "נמסר" : s.session_date >= today ? "נקבע" : "בעבודה") : "ללא צילום",
        cmClient: true,
      });
    }
    return out;
  }, [data.newborn, data.clients, data.sessions, data.accounts, outdoor.data, photo.data, today]);

  const counts = useMemo(() => {
    const m = new Map<Track, number>();
    for (const r of rows) m.set(r.track, (m.get(r.track) ?? 0) + 1);
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (track !== "all" && r.track !== track) return false;
      if (when === "upcoming" && !(r.date && r.date >= today)) return false;
      if (when === "past" && !(r.date && r.date < today)) return false;
      if (onlyOpen && !(r.total - r.paid > 0)) return false;
      if (!term) return true;
      return [r.name, r.phone, r.email, r.pkg, r.track, r.status].some((v) => (v ?? "").toLowerCase().includes(term));
    });
    // Upcoming first (soonest first), then past (latest first), then no date.
    const rank = (r: Row) => (r.date ? (r.date >= today ? 0 : 1) : 2);
    return list.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 0) return a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0;
      if (ra === 1) return a.date! < b.date! ? 1 : a.date! > b.date! ? -1 : 0;
      return a.name.localeCompare(b.name, "he");
    });
  }, [rows, q, track, when, onlyOpen, today]);

  const sum = useMemo(
    () => ({
      total: filtered.reduce((n, r) => n + r.total, 0),
      paid: filtered.reduce((n, r) => n + r.paid, 0),
      open: filtered.reduce((n, r) => n + Math.max(0, r.total - r.paid), 0),
    }),
    [filtered],
  );

  const loading = photo.isLoading || outdoor.isLoading || data.loading;
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs transition ${
      active ? "bg-newborn-ink text-white" : "bg-white text-newborn-ink/70 border border-newborn-rose/15 hover:bg-newborn-blush/40"
    }`;

  return (
    <Panel
      title="🗂️ כל הלקוחות — טבלה אחת"
      action={
        <div className="flex flex-wrap gap-x-2 text-xs text-newborn-ink/60">
          <Link to="/admin/newborn-packages" className="underline">ניו-בורן</Link>·
          <Link to="/admin/outdoor-packages" className="underline">חוץ</Link>·
          <Link to="/admin/photo-clients" className="underline">צילום כללי</Link>·
          <Link to="/admin/photo-clients" search={{ kind: "send" }} className="underline">שליחת תמונות</Link>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
            placeholder="חיפוש לפי שם, טלפון, מייל, חבילה…"
            className="rounded-full bg-white pr-9"
          />
        </div>
        <span className="text-sm text-newborn-ink/60">{filtered.length} לקוחות</span>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        <button type="button" className={chip(track === "all")} onClick={() => { setTrack("all"); setShown(PAGE); }}>
          הכל {rows.length}
        </button>
        {TRACKS.map((t) => (
          <button key={t} type="button" className={chip(track === t)} onClick={() => { setTrack(t); setShown(PAGE); }}>
            {t} {counts.get(t) ?? 0}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["all", "כל התאריכים"],
            ["upcoming", "קרובים"],
            ["past", "עברו"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className={chip(when === k)} onClick={() => { setWhen(k); setShown(PAGE); }}>
            {label}
          </button>
        ))}
        <button type="button" className={chip(onlyOpen)} onClick={() => { setOnlyOpen((v) => !v); setShown(PAGE); }}>
          רק עם יתרה פתוחה
        </button>
      </div>

      {loading ? (
        <EmptyState>טוענת…</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>לא נמצאו לקוחות</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-newborn-rose/10 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-newborn-rose/10 text-right text-xs text-newborn-ink/55">
                <th className="px-3 py-2.5 font-medium">מסלול</th>
                <th className="px-3 py-2.5 font-medium">שם</th>
                <th className="px-3 py-2.5 font-medium">טלפון</th>
                <th className="px-3 py-2.5 font-medium">תאריך</th>
                <th className="px-3 py-2.5 font-medium">חבילה / סוג</th>
                <th className="px-3 py-2.5 font-medium">סכום</th>
                <th className="px-3 py-2.5 font-medium">שולם</th>
                <th className="px-3 py-2.5 font-medium">יתרה</th>
                <th className="px-3 py-2.5 font-medium">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, shown).map((r) => {
                const open = Math.max(0, r.total - r.paid);
                const cells = (
                  <>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${TRACK_TONE[r.track]}`}>{r.track}</span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-newborn-ink whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap" dir="ltr">{r.phone || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.date ? (
                        <>
                          {formatDateIL(r.date)}
                          {r.time ? <span className="text-newborn-ink/50"> · {r.time}</span> : null}
                        </>
                      ) : (
                        <span className="text-newborn-ink/45">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">{r.pkg || "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.total > 0 ? shekel(r.total) : "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.total > 0 || r.paid > 0 ? shekel(r.paid) : "—"}</td>
                    <td className={`px-3 py-2.5 tabular-nums ${open > 0 ? "font-semibold text-newborn-rose" : "text-emerald-700"}`}>
                      {r.total > 0 ? (open > 0 ? shekel(open) : "שולם") : "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-newborn-ink/70">{r.status || "—"}</td>
                  </>
                );
                const cls = "border-b border-newborn-rose/10 last:border-0 hover:bg-newborn-blush/30 cursor-pointer";
                const go = () => {
                  if (r.to) navigate({ to: r.to as any, params: r.params as any });
                  else if (r.cmClient) onOpenCmClient?.();
                };
                return (
                  <tr
                    key={r.key}
                    className={cls}
                    tabIndex={0}
                    onClick={go}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") go();
                    }}
                  >
                    {cells}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-newborn-rose/15 bg-newborn-canvas/40 text-xs font-medium text-newborn-ink">
                <td className="px-3 py-2.5" colSpan={5}>סה״כ ({filtered.length})</td>
                <td className="px-3 py-2.5 tabular-nums">{shekel(sum.total)}</td>
                <td className="px-3 py-2.5 tabular-nums">{shekel(sum.paid)}</td>
                <td className={`px-3 py-2.5 tabular-nums ${sum.open > 0 ? "text-newborn-rose" : ""}`}>{shekel(sum.open)}</td>
                <td className="px-3 py-2.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {filtered.length > shown && (
        <div className="mt-3 text-center">
          <button type="button" className={chip(false)} onClick={() => setShown((n) => n + PAGE)}>
            הצג עוד ({filtered.length - shown})
          </button>
        </div>
      )}
    </Panel>
  );
}

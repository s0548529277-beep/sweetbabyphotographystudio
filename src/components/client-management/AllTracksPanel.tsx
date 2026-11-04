import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listPhotoClients } from "@/lib/photo-clients.functions";
import { formatDateIL, shekel } from "@/lib/client-management";
import { EmptyState, Panel } from "./ui";

/**
 * Main-screen overview of EVERY client track in one place (owner request 2026-11-04):
 * newborn, outdoor, general photo clients and "photos only" delivery — counts plus
 * what is coming up / in progress, each row linking to its own page.
 */
type Item = { key: string; track: string; name: string; date: string | null; extra: string; to: string; params?: any; search?: any; owed: number };

export function AllTracksPanel({ newborn }: { newborn: any[] }) {
  const fetchPhoto = useServerFn(listPhotoClients);
  const photo = useQuery({ queryKey: ["photo-clients"], queryFn: () => fetchPhoto({}) });
  const outdoor = useQuery({
    queryKey: ["outdoor-orders-overview"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("outdoor_package_orders")
        .select("id, contact_name, session_date, session_time, total_price, amount_paid, package_name, delivered_at")
        .order("session_date", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });

  const photoRows = ((photo.data ?? []) as any[]).map((r) => ({ ...r, sendOnly: !r.has_package && r.wants_editing === false }));
  const items: Item[] = [
    ...newborn.map((o) => ({
      key: `nb-${o.id}`, track: "ניו-בורן", name: o.contact_name, date: o.session_date ?? null, extra: "",
      to: "/admin/newborn-packages/$orderId", params: { orderId: o.id },
      owed: Math.max(0, Number(o.total_price ?? 0) - Number(o.amount_paid ?? 0)),
    })),
    ...(outdoor.data ?? []).map((o) => ({
      key: `out-${o.id}`, track: "צילומי חוץ", name: o.contact_name, date: o.session_date ?? null, extra: o.package_name ?? "",
      to: "/admin/outdoor-packages/$orderId", params: { orderId: o.id },
      owed: Math.max(0, Number(o.total_price ?? 0) - Number(o.amount_paid ?? 0)),
    })),
    ...photoRows.map((r) => ({
      key: `ph-${r.id}`, track: r.sendOnly ? "שליחת תמונות" : "צילום כללי", name: r.contact_name, date: r.session_date ? String(r.session_date).slice(0, 10) : null, extra: "",
      to: "/admin/photo-clients/$bookingId", params: { bookingId: r.id }, search: undefined,
      owed: Math.max(0, Number(r.balance ?? 0)),
    })),
  ];

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = items.filter((i) => i.date && i.date >= today).sort((a, b) => (a.date! < b.date! ? -1 : 1)).slice(0, 10);
  const count = (t: string) => items.filter((i) => i.track === t).length;
  const loading = photo.isLoading || outdoor.isLoading;

  return (
    <Panel
      title="🗂️ כל הלקוחות — מבט כולל"
      action={
        <div className="flex gap-1 text-xs text-newborn-ink/60 flex-wrap">
          <Link to="/admin/newborn-packages" className="underline">ניו-בורן {count("ניו-בורן")}</Link>·
          <Link to="/admin/outdoor-packages" className="underline">חוץ {count("צילומי חוץ")}</Link>·
          <Link to="/admin/photo-clients" className="underline">צילום כללי {count("צילום כללי")}</Link>·
          <Link to="/admin/photo-clients" search={{ kind: "send" }} className="underline">שליחת תמונות {count("שליחת תמונות")}</Link>
        </div>
      }
    >
      {loading ? (
        <EmptyState>טוענת…</EmptyState>
      ) : upcoming.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {upcoming.map((i) => (
            <Link
              key={i.key}
              to={i.to as any}
              params={i.params}
              className="flex items-center justify-between gap-2 rounded-2xl border border-newborn-rose/10 bg-white px-4 py-2.5 hover:bg-newborn-blush/30"
            >
              <div>
                <div className="text-sm font-medium text-newborn-ink">{i.name}</div>
                <div className="text-xs text-newborn-ink/55">
                  <span className="rounded-full bg-newborn-blush/60 px-2 py-0.5 ml-1">{i.track}</span>
                  {formatDateIL(i.date)}
                  {i.extra ? ` · ${i.extra}` : ""}
                </div>
              </div>
              {i.owed > 0 && <span className="text-sm font-semibold tabular-nums text-newborn-rose">{shekel(i.owed)}</span>}
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState>אין צילומים קרובים באף מסלול</EmptyState>
      )}
    </Panel>
  );
}

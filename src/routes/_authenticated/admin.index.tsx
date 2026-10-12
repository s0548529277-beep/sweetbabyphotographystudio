import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listAdminNotifications } from "@/lib/admin-notifications.functions";
import { TYPE_LABELS, TYPE_ICONS } from "@/routes/_authenticated/admin.notifications";
import { Package, ShoppingBag, CalendarDays, TrendingUp, Bell, Sun, PackageOpen, PackageCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Overview,
});

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "ממתין לאישור",
  confirmed: "אושר",
  active: "בהשכרה",
  returned: "הוחזר",
  completed: "התקיים",
  cancelled: "בוטל",
};

type RecentOrderRow = {
  id: string;
  kind: "order" | "booking";
  createdAt: string;
  name: string;
  total: number;
  status: string;
};

function Overview() {
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [items, orders, pending, revenue] = await Promise.all([
        supabase.from("items").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("orders").select("total"),
      ]);
      const total = (revenue.data ?? []).reduce((s, o: any) => s + Number(o.total), 0);
      return {
        items: items.count ?? 0,
        orders: orders.count ?? 0,
        pending: pending.count ?? 0,
        revenue: total,
      };
    },
  });

  const fetchNotifs = useServerFn(listAdminNotifications);
  const notifs = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: () => fetchNotifs({}),
    refetchInterval: 15000,
  });
  const recentNotifs = (notifs.data ?? []).slice(0, 8);

  const todayKey = new Date().toISOString().slice(0, 10);
  const today = useQuery({
    queryKey: ["admin-today", todayKey],
    queryFn: async () => {
      const [sessionsRes, pickupsRes, returnsRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, contact_name, start_time, end_time, package, status")
          .eq("session_date", todayKey)
          .neq("status", "cancelled")
          .order("start_time", { ascending: true }),
        supabase
          .from("orders")
          .select("id, contact_name, pickup_at, status")
          .eq("session_date", todayKey)
          .neq("status", "cancelled"),
        supabase
          .from("orders")
          .select("id, contact_name, return_at, status")
          .eq("return_date", todayKey)
          .neq("status", "cancelled"),
      ]);
      return {
        sessions: sessionsRes.data ?? [],
        pickups: pickupsRes.data ?? [],
        returns: returnsRes.data ?? [],
      };
    },
    refetchInterval: 60000,
  });

  const recentOrders = useQuery({
    queryKey: ["admin-recent-orders"],
    queryFn: async (): Promise<RecentOrderRow[]> => {
      const [ordersRes, bookingsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, created_at, contact_name, total, status")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("bookings")
          .select("id, created_at, contact_name, price, status")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      const orders: RecentOrderRow[] = (ordersRes.data ?? []).map((o: any) => ({
        id: o.id,
        kind: "order",
        createdAt: o.created_at,
        name: o.contact_name || "—",
        total: Number(o.total ?? 0),
        status: o.status,
      }));
      const bookings: RecentOrderRow[] = (bookingsRes.data ?? []).map((b: any) => ({
        id: b.id,
        kind: "booking",
        createdAt: b.created_at,
        name: b.contact_name || "—",
        total: Number(b.price ?? 0),
        status: b.status,
      }));
      return [...orders, ...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
    },
    refetchInterval: 15000,
  });

  const cards = [
    { icon: Package, label: "אביזרים בקטלוג", value: stats.data?.items ?? 0, to: "/admin/items" },
    { icon: ShoppingBag, label: "הזמנות סה״כ", value: stats.data?.orders ?? 0, to: "/admin/orders" },
    { icon: CalendarDays, label: "ממתין לאישור", value: stats.data?.pending ?? 0, to: "/admin/orders" },
    { icon: TrendingUp, label: "הכנסות (₪)", value: `₪${(stats.data?.revenue ?? 0).toFixed(0)}`, to: "/admin/orders" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="bg-card rounded-2xl p-6 border border-primary/5 hover:shadow-[var(--shadow-card)] transition-shadow">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-full bg-peach text-primary flex items-center justify-center">
                <c.icon className="h-4 w-4" />
              </div>
              <div className="text-xs tracking-widest uppercase text-muted-foreground">{c.label}</div>
            </div>
            <div className="font-display text-4xl text-primary mt-4">{c.value}</div>
          </Link>
        ))}
      </div>

      <div className="bg-card rounded-2xl p-6 border border-primary/5">
        <h2 className="font-display text-2xl text-primary flex items-center gap-2 mb-4">
          <Sun className="h-5 w-5" /> היום במבט אחד
        </h2>
        {today.isLoading ? (
          <div className="text-muted-foreground text-sm py-6 text-center">טוען…</div>
        ) : !today.data?.sessions.length && !today.data?.pickups.length && !today.data?.returns.length ? (
          <div className="text-muted-foreground text-sm py-6 text-center">אין שום דבר מתוכנן היום.</div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> צילומים בסטודיו ({today.data?.sessions.length ?? 0})
              </div>
              {today.data?.sessions.length ? (
                <ul className="space-y-1.5 text-sm">
                  {today.data.sessions.map((s: any) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{s.contact_name || "—"}</span>
                      <span className="text-muted-foreground shrink-0" dir="ltr">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-muted-foreground">אין צילומים היום</div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <PackageOpen className="h-3.5 w-3.5" /> איסוף אביזרים ({today.data?.pickups.length ?? 0})
              </div>
              {today.data?.pickups.length ? (
                <ul className="space-y-1.5 text-sm">
                  {today.data.pickups.map((o: any) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{o.contact_name || "—"}</span>
                      <span className="text-muted-foreground shrink-0" dir="ltr">
                        {o.pickup_at ? new Date(o.pickup_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-muted-foreground">אין איסופים היום</div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <PackageCheck className="h-3.5 w-3.5" /> החזרת אביזרים ({today.data?.returns.length ?? 0})
              </div>
              {today.data?.returns.length ? (
                <ul className="space-y-1.5 text-sm">
                  {today.data.returns.map((o: any) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{o.contact_name || "—"}</span>
                      <span className="text-muted-foreground shrink-0" dir="ltr">
                        {o.return_at ? new Date(o.return_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-muted-foreground">אין החזרות היום</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl p-6 border border-primary/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl text-primary flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" /> הזמנות אחרונות
            </h2>
            <Link to="/admin/orders" className="text-xs text-forest hover:text-primary underline underline-offset-4">
              לכל ההזמנות
            </Link>
          </div>
          {recentOrders.data?.length === 0 ? (
            <div className="text-muted-foreground text-sm py-10 text-center">אין עדיין הזמנות.</div>
          ) : (
            <div className="divide-y divide-border">
              {(recentOrders.data ?? []).map((o) => {
                const Icon = o.kind === "booking" ? CalendarDays : Package;
                return (
                  <Link
                    key={`${o.kind}-${o.id}`}
                    to="/admin/orders"
                    className="flex items-center gap-3 py-3 hover:bg-cream/50 rounded-lg px-2 -mx-2"
                  >
                    <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 bg-peach text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-primary">{o.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.kind === "booking" ? "השכרת סטודיו" : "השכרת אביזרים"} · {ORDER_STATUS_LABELS[o.status] ?? o.status} ·{" "}
                        {new Date(o.createdAt).toLocaleString("he-IL")}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-primary shrink-0">₪{o.total.toFixed(0)}</div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl p-6 border border-primary/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl text-primary flex items-center gap-2">
              <Bell className="h-5 w-5" /> הודעות מערכת
            </h2>
            <Link to="/admin/notifications" className="text-xs text-forest hover:text-primary underline underline-offset-4">
              לכל ההודעות
            </Link>
          </div>
          {recentNotifs.length === 0 ? (
            <div className="text-muted-foreground text-sm py-10 text-center">אין עדיין הודעות.</div>
          ) : (
            <div className="divide-y divide-border">
              {recentNotifs.map((n: any) => {
                const Icon = TYPE_ICONS[n.type] ?? Bell;
                return (
                  <Link
                    key={n.id}
                    to="/admin/notifications"
                    className="flex items-center gap-3 py-3 hover:bg-cream/50 rounded-lg px-2 -mx-2"
                  >
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${n.read_at ? "bg-cream/60 text-forest/50" : "bg-peach text-primary"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium truncate ${n.read_at ? "text-forest/70" : "text-primary"}`}>{n.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {TYPE_LABELS[n.type] ?? n.type} · {new Date(n.created_at).toLocaleString("he-IL")}
                      </div>
                    </div>
                    {!n.read_at && <div className="h-2 w-2 rounded-full bg-destructive shrink-0" />}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

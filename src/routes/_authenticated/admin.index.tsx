import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listAdminNotifications } from "@/lib/admin-notifications.functions";
import { TYPE_LABELS, TYPE_ICONS } from "@/routes/_authenticated/admin.notifications";
import { Package, ShoppingBag, CalendarDays, TrendingUp, Bell } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Overview,
});

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
  );
}

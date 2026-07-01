import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, ShoppingBag, CalendarDays, TrendingUp } from "lucide-react";

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

  const recent = useQuery({
    queryKey: ["recent-orders"],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(6);
      return data ?? [];
    },
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
        <h2 className="font-display text-2xl text-primary mb-4">הזמנות אחרונות</h2>
        {(recent.data?.length ?? 0) === 0 ? (
          <div className="text-muted-foreground text-sm py-10 text-center">אין עדיין הזמנות.</div>
        ) : (
          <div className="divide-y divide-border">
            {recent.data!.map((o: any) => (
              <Link key={o.id} to="/admin/orders" className="flex items-center justify-between py-3 hover:bg-cream/50 rounded-lg px-2 -mx-2">
                <div>
                  <div className="font-medium">{o.contact_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("he-IL")} · {o.status}
                  </div>
                </div>
                <div className="font-display text-xl text-peach-deep">₪{Number(o.total).toFixed(0)}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

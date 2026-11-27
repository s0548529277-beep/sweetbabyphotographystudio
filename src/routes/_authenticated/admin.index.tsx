import { createFileRoute, Link } from "@tanstack/react-router";
import { isBookingDone, isPackageDone, isPropsOrderDone } from "@/lib/income-done";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminMailPanel } from "@/components/AdminMailPanel";
import { DraftsStatusTile } from "@/components/DraftsStatusTile";
import { SchedulerStatusTile } from "@/components/SchedulerStatusTile";
import { Package, ShoppingBag, CalendarDays, TrendingUp, Bell, Sun, PackageOpen, PackageCheck, Wallet, Baby, Home } from "lucide-react";

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
        supabase.from("orders").select("total,status,scheduled_date,session_date,return_date,return_at"),
      ]);
      // Only props orders that were actually done (returned / return date passed) and not cancelled count as income.
      const now = new Date();
      const total = (revenue.data ?? []).reduce((s, o: any) => s + (o.status !== "cancelled" && isPropsOrderDone(o, now) ? Number(o.total ?? 0) : 0), 0);
      return {
        items: items.count ?? 0,
        orders: orders.count ?? 0,
        pending: pending.count ?? 0,
        revenue: total,
      };
    },
  });

  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
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

  const cards = [
    { icon: Package, label: "אביזרים בקטלוג", value: stats.data?.items ?? 0, to: "/admin/items" },
    { icon: ShoppingBag, label: "הזמנות סה״כ", value: stats.data?.orders ?? 0, to: "/admin/orders" },
    { icon: CalendarDays, label: "ממתין לאישור", value: stats.data?.pending ?? 0, to: "/admin/orders" },
    { icon: TrendingUp, label: "הכנסות (₪)", value: `₪${(stats.data?.revenue ?? 0).toFixed(0)}`, to: "/admin/orders" },
  ];

  return (
    <div className="space-y-8">
      <SchedulerStatusTile />
      <DraftsStatusTile />
      <IncomeSummary />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="bg-card rounded-2xl p-4 sm:p-6 border border-primary/5 hover:shadow-[var(--shadow-card)] transition-shadow">
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

      <div className="bg-card rounded-2xl p-4 sm:p-6 border border-primary/5">
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
                        {o.pickup_at ? String(o.pickup_at).slice(11, 16) : "—"}
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
                        {o.return_at ? String(o.return_at).slice(11, 16) : "—"}
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

      <AdminMailPanel />
    </div>
  );
}

// ── Income summary (top of the main admin page) ─────────────────────────────
// Requested 2026-10-25: one big "how much came in" figure + small figures for
// newborn / props / studio. Same sources and rules as /admin/finance
// (non-cancelled orders/bookings, by session date), plus newborn-package
// orders (total_price, by session date) and manual income. The big total is
// everything; the three small ones are the business lines she asked to see.
// Since 2026-11-26 only work that was already DONE is counted (see src/lib/income-done.ts).
type Period = "month" | "year" | "all";

const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;

function inPeriod(dateStr: string | null | undefined, period: Period): boolean {
  if (period === "all") return true;
  if (!dateStr) return false;
  const d = String(dateStr).slice(0, 10);
  const now = new Date();
  const y = String(now.getFullYear());
  if (period === "year") return d.startsWith(y);
  const m = `${y}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return d.startsWith(m);
}

function IncomeSummary() {
  const [period, setPeriod] = useState<Period>("month");
  const q = useQuery({
    queryKey: ["admin-income-summary"],
    queryFn: async () => {
      const [ordersRes, bookingsRes, newbornRes, manualRes, outdoorRes, studioCustomRes] = await Promise.all([
        supabase.from("orders").select("total,status,created_at,scheduled_date,session_date,return_date,return_at"),
        supabase.from("bookings").select("price,status,package,session_date,end_time,created_at"),
        (supabase as any).from("newborn_package_orders").select("total_price,session_date,session_time,shoot_done_at,created_at"),
        supabase.from("manual_income").select("amount,received_on"),
        // Outdoor shoots + custom-studio packages share the clients page with
        // newborn orders, so they count in the same "חבילות צילום" tile.
        (supabase as any).from("outdoor_package_orders").select("total_price,session_date,session_time,shoot_done_at,created_at"),
        (supabase as any).from("studio_custom_orders").select("total_price,session_date,session_time,duration_hours,shoot_done_at,created_at"),
      ]);
      return {
        orders: (ordersRes.data ?? []) as any[],
        bookings: (bookingsRes.data ?? []) as any[],
        newborn: (newbornRes.data ?? []) as any[],
        manual: (manualRes.data ?? []) as any[],
        outdoor: (outdoorRes.data ?? []) as any[],
        studioCustom: (studioCustomRes.data ?? []) as any[],
      };
    },
    refetchInterval: 60000,
  });

  const d = q.data;
  let props = 0,
    studio = 0,
    newborn = 0,
    other = 0;
  // Only work that was DONE counts (owner, 2026-11-26): props returned, studio hours over, shoot taken.
  const now = new Date();
  if (d) {
    for (const o of d.orders) {
      if (o.status === "cancelled" || !isPropsOrderDone(o, now)) continue;
      if (inPeriod(o.scheduled_date ?? o.created_at, period)) props += Number(o.total ?? 0);
    }
    for (const b of d.bookings) {
      if (b.status === "cancelled" || !isBookingDone(b, now)) continue;
      if (!inPeriod(b.session_date ?? b.created_at, period)) continue;
      // package "newborn" rows are the studio-blocking mirror of a
      // newborn_package_orders row (syncNewbornBookingBlock, price =
      // total_price) — already counted below from the order itself.
      if (b.package === "newborn") continue;
      if (b.package === "photography") other += Number(b.price ?? 0);
      else studio += Number(b.price ?? 0);
    }
    for (const n of [...d.newborn, ...d.outdoor, ...d.studioCustom]) {
      if (!isPackageDone(n, now)) continue;
      if (inPeriod(n.session_date ?? n.created_at, period)) newborn += Number(n.total_price ?? 0);
    }
    for (const m of d.manual) {
      if (inPeriod(m.received_on, period)) other += Number(m.amount ?? 0);
    }
  }
  const total = props + studio + newborn + other;
  const periodLabel = period === "month" ? "החודש" : period === "year" ? "השנה" : "מאז ומעולם";

  return (
    <div className="bg-card rounded-2xl p-4 sm:p-6 border border-primary/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wallet className="h-4 w-4" /> כמה נכנס {periodLabel}
        </div>
        <div className="flex gap-1 bg-cream/60 rounded-full p-1 text-xs">
          {(
            [
              ["month", "החודש"],
              ["year", "השנה"],
              ["all", "הכל"],
            ] as [Period, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setPeriod(k)}
              className={`px-3 py-1 rounded-full transition-colors ${period === k ? "bg-primary text-primary-foreground" : "hover:bg-primary/10"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <Link to="/admin/finance" className="block font-display text-5xl text-primary mt-3 hover:opacity-80">
        {q.isLoading ? "…" : ils(total)}
      </Link>
      <div className="grid grid-cols-3 gap-3 mt-5">
        {[
          { icon: Baby, label: "חבילות צילום", value: newborn, to: "/admin/newborn-packages" },
          { icon: Package, label: "אביזרים", value: props, to: "/admin/orders" },
          { icon: Home, label: "סטודיו", value: studio, to: "/admin/calendar" },
        ].map((s) => (
          <Link key={s.label} to={s.to} className="rounded-xl bg-cream/50 p-3 hover:bg-cream transition-colors">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <s.icon className="h-3.5 w-3.5" /> {s.label}
            </div>
            <div className="font-display text-lg text-forest mt-1">{q.isLoading ? "…" : ils(s.value)}</div>
          </Link>
        ))}
      </div>
      {other > 0 && (
        <div className="text-[11px] text-muted-foreground mt-3">
          הסכום הגדול כולל גם {ils(other)} מצילומים אחרים והכנסות ידניות.
        </div>
      )}
    </div>
  );
}

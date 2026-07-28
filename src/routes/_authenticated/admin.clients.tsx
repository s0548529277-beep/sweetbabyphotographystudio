import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Camera, Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/clients")({
  component: ClientsAdmin,
});

function ClientsAdmin() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ id: string; view: "order" | "booking" } | null>(null);

  const clients = useQuery({
    queryKey: ["admin-clients"],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [profilesRes, ordersRes, bookingsRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("orders").select("id, user_id, total, status, scheduled_date, session_date, created_at"),
        supabase.from("bookings").select("id, user_id, price, status, session_date, start_time, end_time, package, created_at"),
      ]);
      return (profilesRes.data ?? []).map((p: any) => ({
        ...p,
        orders: (ordersRes.data ?? []).filter((o: any) => o.user_id === p.id),
        bookings: (bookingsRes.data ?? []).filter((b: any) => b.user_id === p.id),
      }));
    },
  });


  const filtered = (clients.data ?? []).filter((c: any) =>
    !q || (c.full_name ?? "").toLowerCase().includes(q.toLowerCase()) || (c.phone ?? "").includes(q),
  );

  return (
    <div className="space-y-4">
      <Input placeholder="חיפוש שם או טלפון…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm rounded-full" />
      <div className="bg-card rounded-2xl border border-primary/5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream/60 text-right">
            <tr>
              <th className="p-3 font-medium">שם</th>
              <th className="p-3 font-medium">טלפון</th>
              <th className="p-3 font-medium">כתובת</th>
              <th className="p-3 font-medium">צפייה</th>
              <th className="p-3 font-medium">סה״כ צריכה</th>
              <th className="p-3 font-medium">הצטרפות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => {
              const orders = c.orders ?? [];
              const bookings = c.bookings ?? [];
              const total =
                orders.reduce((s: number, o: any) => s + Number(o.total ?? 0), 0) +
                bookings.reduce((s: number, b: any) => s + Number(b.price ?? 0), 0);
              const isOpen = open?.id === c.id;
              const list = isOpen ? (open!.view === "order" ? orders : bookings) : [];
              return (
                <>
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3 font-medium">{c.full_name || "—"}</td>
                    <td className="p-3" dir="ltr">{c.phone || "—"}</td>
                    <td className="p-3 text-muted-foreground">{c.address || "—"}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={isOpen && open!.view === "order" ? "default" : "outline"}
                          className="rounded-full gap-1.5 h-8"
                          onClick={() => setOpen(isOpen && open!.view === "order" ? null : { id: c.id, view: "order" })}
                        >
                          <Package className="h-3.5 w-3.5" /> הזמנות ({orders.length})
                        </Button>
                        <Button
                          size="sm"
                          variant={isOpen && open!.view === "booking" ? "default" : "outline"}
                          className="rounded-full gap-1.5 h-8"
                          onClick={() => setOpen(isOpen && open!.view === "booking" ? null : { id: c.id, view: "booking" })}
                        >
                          <Camera className="h-3.5 w-3.5" /> סטודיו ({bookings.length})
                        </Button>
                      </div>
                    </td>
                    <td className="p-3 font-display text-peach-deep">₪{total.toFixed(0)}</td>
                    <td className="p-3 text-muted-foreground">{new Date(c.created_at).toLocaleDateString("he-IL")}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-cream/40">
                      <td colSpan={6} className="p-4">
                        {list.length === 0 ? (
                          <div className="text-muted-foreground text-sm">
                            {open!.view === "order" ? "אין הזמנות אביזרים" : "אין השכרות סטודיו"}
                          </div>
                        ) : (
                          <ul className="space-y-2">
                            {list.map((r: any) => (
                              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2">
                                <div className="flex items-center gap-2">
                                  {open!.view === "order" ? <Package className="h-4 w-4 text-blush-deep" /> : <Camera className="h-4 w-4 text-forest" />}
                                  <span>
                                    {(r.session_date ?? r.scheduled_date)
                                      ? new Date(r.session_date ?? r.scheduled_date).toLocaleDateString("he-IL")
                                      : new Date(r.created_at).toLocaleDateString("he-IL")}
                                  </span>
                                  {r.start_time && <span className="text-xs text-muted-foreground" dir="ltr">{r.start_time}–{r.end_time}</span>}
                                  {r.package && <span className="text-xs text-muted-foreground">{r.package}</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                  <Badge variant="secondary" className="text-[10px]">{r.status}</Badge>
                                  <span className="font-display text-peach-deep">₪{Number(r.total ?? r.price ?? 0).toFixed(0)}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={6} className="p-16 text-center text-muted-foreground">אין לקוחות עדיין.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

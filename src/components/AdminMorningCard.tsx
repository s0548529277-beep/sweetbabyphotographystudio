import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isOwnerTestContact } from "@/lib/lead-exclusions";

// "הבוקר שלך" — one card on the admin home: who is waiting (new inquiries / leads) and new orders.
export function AdminMorningCard() {
  const q = useQuery({
    queryKey: ["admin-morning"],
    refetchInterval: 60000,
    queryFn: async () => {
      const since = new Date(Date.now() - 3 * 86400000).toISOString();
      const [leads, orders, bookings] = await Promise.all([
        supabase.from("inquiry_leads").select("id,name,phone,email,source,created_at,status").eq("status", "new").gte("created_at", since).order("created_at", { ascending: false }).limit(30),
        supabase.from("orders").select("id,name,status,created_at").eq("status", "pending").gte("created_at", since).order("created_at", { ascending: false }).limit(20),
        supabase.from("bookings").select("id,status,created_at").eq("status", "pending").gte("created_at", since).limit(20),
      ]);
      const L = ((leads.data ?? []) as any[]).filter((l) => !isOwnerTestContact({ name: l.name, phone: l.phone, email: l.email }));
      return { leads: L, orders: (orders.data ?? []) as any[], bookings: (bookings.data ?? []) as any[] };
    },
  });
  const leads = q.data?.leads ?? [];
  const orders = q.data?.orders ?? [];
  const bookings = q.data?.bookings ?? [];
  const total = leads.length + orders.length + bookings.length;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 mb-4">
      <h2 className="font-display text-lg flex items-center gap-2 mb-2"><Sun className="h-5 w-5" /> הבוקר שלך</h2>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">טוען…</p>
      ) : total === 0 ? (
        <p className="text-sm text-muted-foreground">אין כרגע מי שמחכה לך 🌿</p>
      ) : (
        <div className="space-y-1.5 text-sm">
          {leads.length > 0 && (
            <Link to="/admin/leads" className="flex justify-between rounded-lg bg-muted/40 px-3 py-2 hover:bg-muted">
              <span>פניות ולידים חדשים (טופס, שאלון, צ'אט)</span><b>{leads.length}</b>
            </Link>
          )}
          {(orders.length + bookings.length) > 0 && (
            <Link to="/admin/orders" className="flex justify-between rounded-lg bg-muted/40 px-3 py-2 hover:bg-muted">
              <span>הזמנות חדשות</span><b>{orders.length + bookings.length}</b>
            </Link>
          )}
          {leads.slice(0, 3).map((l) => (
            <div key={l.id} className="px-3 text-muted-foreground truncate">• {l.name || l.email || l.phone || "פנייה"}</div>
          ))}
        </div>
      )}
    </section>
  );
}

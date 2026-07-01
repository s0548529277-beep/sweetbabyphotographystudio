import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/admin/clients")({
  component: ClientsAdmin,
});

function ClientsAdmin() {
  const [q, setQ] = useState("");

  const clients = useQuery({
    queryKey: ["admin-clients"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*, orders(id, total, status, created_at)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = (clients.data ?? []).filter((c: any) =>
    !q || (c.full_name ?? "").toLowerCase().includes(q.toLowerCase()) || (c.phone ?? "").includes(q),
  );

  return (
    <div className="space-y-4">
      <Input placeholder="חיפוש שם או טלפון…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm rounded-full" />
      <div className="bg-card rounded-2xl border border-primary/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream/60 text-right">
            <tr>
              <th className="p-3 font-medium">שם</th>
              <th className="p-3 font-medium">טלפון</th>
              <th className="p-3 font-medium">כתובת</th>
              <th className="p-3 font-medium">הזמנות</th>
              <th className="p-3 font-medium">סה״כ צריכה</th>
              <th className="p-3 font-medium">הצטרפות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => {
              const total = (c.orders ?? []).reduce((s: number, o: any) => s + Number(o.total), 0);
              return (
                <tr key={c.id} className="border-t border-border">
                  <td className="p-3 font-medium">{c.full_name || "—"}</td>
                  <td className="p-3" dir="ltr">{c.phone || "—"}</td>
                  <td className="p-3 text-muted-foreground">{c.address || "—"}</td>
                  <td className="p-3">{c.orders?.length ?? 0}</td>
                  <td className="p-3 font-display text-peach-deep">₪{total.toFixed(0)}</td>
                  <td className="p-3 text-muted-foreground">{new Date(c.created_at).toLocaleDateString("he-IL")}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={6} className="p-16 text-center text-muted-foreground">אין לקוחות עדיין.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

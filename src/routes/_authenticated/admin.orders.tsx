import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  component: OrdersAdmin,
});

const STATUS = [
  { v: "pending", l: "ממתין לאישור" },
  { v: "confirmed", l: "אושר" },
  { v: "active", l: "בהשכרה" },
  { v: "returned", l: "הוחזר" },
  { v: "cancelled", l: "בוטל" },
];

function OrdersAdmin() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ["admin-orders"],
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*), profiles(full_name, phone)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status: status as any }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("סטטוס עודכן"); qc.invalidateQueries({ queryKey: ["admin-orders"] }); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl border border-primary/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream/60 text-right">
            <tr>
              <th className="p-3" />
              <th className="p-3 font-medium">תאריך</th>
              <th className="p-3 font-medium">לקוח</th>
              <th className="p-3 font-medium">טלפון</th>
              <th className="p-3 font-medium">תאריך צילום</th>
              <th className="p-3 font-medium">סה״כ</th>
              <th className="p-3 font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {(orders.data ?? []).map((o: any) => (
              <>
                <tr key={o.id} className="border-t border-border">
                  <td className="p-2">
                    <Button size="icon" variant="ghost" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                      {expanded === o.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </td>
                  <td className="p-3 whitespace-nowrap">{new Date(o.created_at).toLocaleDateString("he-IL")}</td>
                  <td className="p-3 font-medium">{o.contact_name || o.profiles?.full_name || "—"}</td>
                  <td className="p-3" dir="ltr">{o.contact_phone || o.profiles?.phone || "—"}</td>
                  <td className="p-3">{o.scheduled_date ? new Date(o.scheduled_date).toLocaleDateString("he-IL") : "—"}</td>
                  <td className="p-3 font-display text-peach-deep">₪{Number(o.total).toFixed(0)}</td>
                  <td className="p-3">
                    <Select value={o.status} onValueChange={(v) => setStatus(o.id, v)}>
                      <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
                {expanded === o.id && (
                  <tr className="bg-cream/40">
                    <td colSpan={7} className="p-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">פריטים</div>
                          <ul className="text-sm space-y-1">
                            {o.order_items?.map((oi: any) => (
                              <li key={oi.id} className="flex justify-between">
                                <span>{oi.item_name} <span className="text-muted-foreground">({oi.item_sku})</span> × {oi.quantity}</span>
                                <span>₪{(oi.price * oi.quantity).toFixed(0)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">פרטים</div>
                          <div className="text-sm space-y-1">
                            <div>החזרה: {o.return_date ? new Date(o.return_date).toLocaleDateString("he-IL") : "—"}</div>
                            {o.notes && <div>הערות: {o.notes}</div>}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {(orders.data?.length ?? 0) === 0 && (
              <tr><td colSpan={7} className="p-16 text-center text-muted-foreground">אין הזמנות עדיין.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

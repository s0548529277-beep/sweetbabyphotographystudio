import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { he } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/admin/calendar")({
  component: CalendarAdmin,
});

function CalendarAdmin() {
  const [selected, setSelected] = useState<Date | undefined>(new Date());

  const orders = useQuery({
    queryKey: ["calendar-orders"],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*").not("scheduled_date", "is", null);
      return data ?? [];
    },
  });

  const byDate = new Map<string, any[]>();
  (orders.data ?? []).forEach((o: any) => {
    if (!o.scheduled_date) return;
    const list = byDate.get(o.scheduled_date) ?? [];
    list.push(o);
    byDate.set(o.scheduled_date, list);
  });

  const key = selected ? selected.toISOString().slice(0, 10) : "";
  const dayOrders = byDate.get(key) ?? [];
  const scheduledDates = Array.from(byDate.keys()).map((s) => new Date(s));

  return (
    <div className="grid lg:grid-cols-[auto_1fr] gap-6">
      <div className="bg-card rounded-2xl p-4 border border-primary/5 w-fit">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={setSelected}
          locale={he}
          modifiers={{ scheduled: scheduledDates }}
          modifiersClassNames={{ scheduled: "bg-peach text-primary font-medium rounded-full" }}
        />
        <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-peach" /> יש הזמנה
        </div>
      </div>

      <div className="bg-card rounded-2xl p-6 border border-primary/5">
        <h2 className="font-display text-2xl text-primary mb-1">
          {selected?.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
        </h2>
        <p className="text-xs text-muted-foreground mb-5">{dayOrders.length} הזמנות</p>

        {dayOrders.length === 0 ? (
          <div className="text-muted-foreground py-10 text-center border border-dashed border-primary/20 rounded-xl">
            אין הזמנות ליום זה
          </div>
        ) : (
          <div className="space-y-3">
            {dayOrders.map((o: any) => (
              <div key={o.id} className="flex items-center justify-between p-4 rounded-xl bg-cream/50">
                <div>
                  <div className="font-medium">{o.contact_name}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{o.contact_phone}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">{o.status}</Badge>
                  <div className="font-display text-lg text-peach-deep">₪{Number(o.total).toFixed(0)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

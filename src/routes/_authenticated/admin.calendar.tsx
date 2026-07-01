import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { he } from "date-fns/locale";
import { Camera, CalendarDays, Clock, Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/calendar")({
  component: CalendarAdmin,
});

type Entry = {
  id: string;
  kind: "order" | "booking";
  date: string; // YYYY-MM-DD
  contact_name: string | null;
  contact_phone: string | null;
  status: string | null;
  amount: number;
  start_time?: string | null;
  end_time?: string | null;
};

const toLocalKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function CalendarAdmin() {
  const [selected, setSelected] = useState<Date | undefined>(new Date());

  const q = useQuery({
    queryKey: ["calendar-entries"],
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Entry[]> => {
      const [ordersRes, bookingsRes] = await Promise.all([
        supabase.from("orders").select("id,contact_name,contact_phone,status,total,session_date,scheduled_date,created_at"),
        supabase.from("bookings").select("id,contact_name,contact_phone,status,price,session_date,start_time,end_time,created_at"),
      ]);
      const orders: Entry[] = (ordersRes.data ?? []).map((o: any) => ({
        id: o.id,
        kind: "order" as const,
        date: o.session_date ?? o.scheduled_date ?? (o.created_at ? o.created_at.slice(0, 10) : ""),
        contact_name: o.contact_name,
        contact_phone: o.contact_phone,
        status: o.status,
        amount: Number(o.total ?? 0),
      })).filter((e) => e.date);
      const bookings: Entry[] = (bookingsRes.data ?? []).map((b: any) => ({
        id: b.id,
        kind: "booking" as const,
        date: b.session_date ?? (b.created_at ? b.created_at.slice(0, 10) : ""),
        contact_name: b.contact_name,
        contact_phone: b.contact_phone,
        status: b.status,
        amount: Number(b.price ?? 0),
        start_time: b.start_time,
        end_time: b.end_time,
      })).filter((e) => e.date);
      return [...bookings, ...orders];
    },
  });

  const { byDate, scheduledDates } = useMemo(() => {
    const map = new Map<string, Entry[]>();
    (q.data ?? []).forEach((e) => {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    });
    // sort each day: bookings first by start_time
    map.forEach((list) =>
      list.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "booking" ? -1 : 1;
        return (a.start_time ?? "").localeCompare(b.start_time ?? "");
      })
    );
    return {
      byDate: map,
      scheduledDates: Array.from(map.keys()).map((s) => {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      }),
    };
  }, [q.data]);

  const key = selected ? toLocalKey(selected) : "";
  const dayEntries = byDate.get(key) ?? [];
  const bookingsCount = dayEntries.filter((e) => e.kind === "booking").length;
  const ordersCount = dayEntries.filter((e) => e.kind === "order").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-primary">יומן מסודר</h1>
          <p className="text-xs text-muted-foreground mt-1">
            עדכון אוטומטי כל 30 שניות · {q.data?.length ?? 0} רישומים סה״כ
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} className="rounded-full gap-2">
          <RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} /> רענון
        </Button>
      </div>

      <div className="grid lg:grid-cols-[auto_1fr] gap-6">
        <div className="bg-card rounded-2xl p-4 border border-primary/5 w-fit h-fit">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={setSelected}
            locale={he}
            modifiers={{ scheduled: scheduledDates }}
            modifiersClassNames={{ scheduled: "bg-blush text-primary font-medium rounded-full" }}
          />
          <div className="text-xs text-muted-foreground mt-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-blush" /> יום עם שיבוץ
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <CalendarDays className="h-3 w-3 text-forest" /> סטודיו
              <Package className="h-3 w-3 text-blush-deep mr-2" /> אביזרים
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl p-6 border border-primary/5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display text-2xl text-primary">
                {selected?.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
              </h2>
              <p className="text-xs text-muted-foreground">
                {bookingsCount} שיבוצי סטודיו · {ordersCount} הזמנות אביזרים
              </p>
            </div>
          </div>

          {dayEntries.length === 0 ? (
            <div className="text-muted-foreground py-14 text-center border border-dashed border-primary/20 rounded-xl">
              אין שיבוצים ליום זה
            </div>
          ) : (
            <div className="space-y-3">
              {dayEntries.map((e) => (
                <Link
                  key={`${e.kind}-${e.id}`}
                  to="/summary/$type/$id"
                  params={{ type: e.kind, id: e.id }}
                  className="flex items-center justify-between p-4 rounded-xl bg-blush/25 hover:bg-blush/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center ${e.kind === "booking" ? "bg-forest/15 text-forest" : "bg-blush-deep/15 text-blush-deep"}`}>
                      {e.kind === "booking" ? <Camera className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="font-medium text-primary">{e.contact_name || "—"}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2" dir="ltr">
                        {e.start_time && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{e.start_time}–{e.end_time}</span>}
                        {e.contact_phone && <span>{e.contact_phone}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-[10px]">{e.status ?? "—"}</Badge>
                    <div className="font-display text-lg text-blush-deep" dir="ltr">₪{e.amount.toFixed(0)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

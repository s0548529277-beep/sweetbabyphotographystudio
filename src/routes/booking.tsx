import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { placeBooking, computeStudioPrice } from "@/lib/bookings.functions";
import { toast } from "sonner";
import { he } from "date-fns/locale";
import { Lock, Clock } from "lucide-react";

export const Route = createFileRoute("/booking")({
  component: Booking,
  head: () => ({ meta: [{ title: "שריון סטודיו | Sweetbaby" }] }),
});

// Half-hour slot generation for a given date, factoring in Fri/Sat rules
function slotsForDate(d: Date, closures: { date: string; closed: boolean; open_time: string | null; close_time: string | null }[]): string[] {
  const iso = d.toISOString().slice(0, 10);
  const closure = closures.find((c) => c.date === iso);
  const day = d.getDay(); // 0=Sun ... 6=Sat
  let openMin = 8 * 60;
  let closeMin = 23 * 60;
  if (day === 5) closeMin = 15 * 60; // Fri fallback until admin overrides
  if (day === 6) openMin = 20 * 60;  // Sat fallback (after Shabbat) until admin overrides
  if (closure) {
    if (closure.closed) return [];
    if (closure.open_time) { const [h, m] = closure.open_time.split(":").map(Number); openMin = h * 60 + m; }
    if (closure.close_time) { const [h, m] = closure.close_time.split(":").map(Number); closeMin = h * 60 + m; }
  }
  const out: string[] = [];
  for (let t = openMin; t < closeMin; t += 30) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

type Booking = { start_time: string; end_time: string };

function overlaps(slotStart: string, slotSlots: number, existing: Booking[]) {
  const [h, m] = slotStart.split(":").map(Number);
  const s = h * 60 + m;
  const e = s + slotSlots * 30;
  for (const b of existing) {
    const [bh, bm] = String(b.start_time).split(":").map(Number);
    const [eh, em] = String(b.end_time).split(":").map(Number);
    const bs = bh * 60 + bm;
    const be = eh * 60 + em;
    if (s < be && e > bs) return true;
  }
  return false;
}

function Booking() {
  const { user } = useAuth();
  const nav = useNavigate();
  const place = useServerFn(placeBooking);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [existing, setExisting] = useState<Booking[]>([]);
  const [closures, setClosures] = useState<any[]>([]);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [slots, setSlots] = useState(2);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("studio_closures").select("*").then(({ data }) => setClosures(data ?? []));
  }, []);

  useEffect(() => {
    if (!date) return;
    const iso = date.toISOString().slice(0, 10);
    supabase
      .from("bookings")
      .select("start_time, end_time")
      .eq("session_date", iso)
      .neq("status", "cancelled")
      .then(({ data }) => setExisting(data ?? []));
    setStartTime(null);
  }, [date]);

  const daySlots = useMemo(() => (date ? slotsForDate(date, closures) : []), [date, closures]);

  const price = useMemo(() => {
    if (!startTime) return 0;
    try { return computeStudioPrice(slots, startTime); } catch { return 0; }
  }, [startTime, slots]);

  const canBook = date && startTime && slots >= 2 && contactName && contactPhone && terms && user;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !startTime) return;
    setBusy(true);
    try {
      const res = await place({
        data: {
          session_date: date.toISOString().slice(0, 10),
          start_time: startTime,
          slots,
          contact_name: contactName,
          contact_phone: contactPhone,
          notes,
          terms_accepted: true as const,
        },
      });
      toast.success("השריון נוצר! ממשיכות לתשלום המקדמה.");
      nav({ to: "/deposit/$type/$id", params: { type: "booking", id: res.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשריון");
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <section className="container-page py-24 flex-1">
          <div className="max-w-md mx-auto text-center glass-card rounded-3xl p-10">
            <Lock className="h-8 w-8 text-primary/40 mx-auto mb-3" />
            <h2 className="font-display text-3xl text-primary mb-2">התחברות נדרשת</h2>
            <p className="text-muted-foreground text-sm mb-6">כדי לשריין את הסטודיו יש להיכנס לחשבון.</p>
            <Link to="/auth" search={{ redirect: "/booking" }}>
              <Button className="rounded-full w-full">התחברות</Button>
            </Link>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <section className="container-page py-12 flex-1">
        <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">Studio Booking</div>
        <h1 className="font-display text-5xl text-primary mb-10">שריון יומן הסטודיו</h1>

        <form onSubmit={submit} className="grid lg:grid-cols-[auto_1fr_360px] gap-6">
          <div className="glass-card rounded-3xl p-4 w-fit">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              locale={he}
              disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
            />
          </div>

          <div className="glass-card rounded-3xl p-6">
            <h2 className="font-display text-2xl text-primary mb-1">בחירת שעה</h2>
            <p className="text-xs text-muted-foreground mb-5">מינימום שעה מלאה (2 חצאי שעות). חבילת בוקר 08:00–11:00 · 240₪.</p>

            {!date && <div className="text-muted-foreground text-sm py-14 text-center">בחרי תאריך כדי לראות שעות פנויות</div>}
            {date && daySlots.length === 0 && <div className="text-muted-foreground text-sm py-14 text-center">אין שעות פעילות ביום זה</div>}

            {date && daySlots.length > 0 && (
              <>
                <div className="grid grid-cols-4 md:grid-cols-6 gap-2 mb-6">
                  {daySlots.map((s) => {
                    const taken = overlaps(s, 1, existing);
                    const selected = startTime === s;
                    return (
                      <button
                        type="button"
                        key={s}
                        disabled={taken}
                        onClick={() => setStartTime(s)}
                        className={`h-11 rounded-xl text-sm border transition-all ${
                          taken
                            ? "opacity-30 line-through cursor-not-allowed border-border"
                            : selected
                            ? "bg-primary text-primary-foreground border-primary shadow-lg"
                            : "border-border hover:border-primary bg-card"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-border pt-5">
                  <Label className="text-sm">משך זמן</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[2, 3, 4, 5, 6, 8].map((n) => {
                      const conflict = startTime ? overlaps(startTime, n, existing) : false;
                      const disabled = !startTime || conflict;
                      const active = slots === n;
                      const label = n % 2 === 0 ? `${n / 2} שעות` : `${Math.floor(n / 2)}.5 שעות`;
                      return (
                        <button
                          type="button"
                          key={n}
                          disabled={disabled}
                          onClick={() => setSlots(n)}
                          className={`h-10 px-4 rounded-full text-sm border ${
                            disabled ? "opacity-30 cursor-not-allowed border-border" : active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary bg-card"
                          }`}
                        >
                          {n === 2 ? "שעה" : label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <aside className="space-y-4">
            <div className="glass-card rounded-3xl p-6 space-y-4">
              <h2 className="font-display text-xl text-primary">פרטים אחרונים</h2>
              <div>
                <Label>שם מלא *</Label>
                <Input required value={contactName} onChange={(e) => setContactName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>טלפון *</Label>
                <Input required type="tel" dir="ltr" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>הערות</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
              </div>
              <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox checked={terms} onCheckedChange={(v) => setTerms(!!v)} className="mt-0.5" />
                <span>אני מאשרת את תנאי הסטודיו (ניקיון, אבדות, נזקים, חריגות זמן).</span>
              </label>
            </div>

            <div className="bg-primary text-primary-foreground rounded-3xl p-6">
              <div className="text-blush text-xs tracking-[0.3em] uppercase mb-2">Summary</div>
              <div className="flex items-center gap-2 text-sm text-primary-foreground/70 mb-4">
                <Clock className="h-4 w-4 text-blush" />
                {date ? date.toLocaleDateString("he-IL", { day: "numeric", month: "long" }) : "לא נבחר תאריך"}
                {startTime && ` · ${startTime}`}
                {startTime && slots && ` · ${slots / 2} שעות`}
              </div>
              <div className="flex items-baseline justify-between mb-4">
                <span className="text-primary-foreground/70 text-sm">סה״כ</span>
                <span className="font-display text-4xl text-blush">₪{price}</span>
              </div>
              <div className="text-xs text-primary-foreground/60 mb-4">מתוכם 90₪ מקדמה לשריון</div>
              <Button type="submit" disabled={!canBook || busy} className="w-full rounded-full h-12 bg-blush text-primary hover:bg-blush-deep">
                {busy ? "רגע…" : "המשך לתשלום מקדמה"}
              </Button>
            </div>
          </aside>
        </form>
      </section>
      <Footer />
    </div>
  );
}

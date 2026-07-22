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
import { Lock, Clock, Sparkles, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/booking")({
  component: Booking,
  head: () => ({
    meta: [
      { title: "שריון סטודיו | Sweetbaby" },
      { name: "description", content: "שריינו סטודיו צילום בבית שמש — Sweetbaby מציעה יומן פתוח, חבילות בוקר ומחירון שקוף לצילומי ניוברן ומשפחה." },
      { property: "og:title", content: "שריון סטודיו | Sweetbaby" },
      { property: "og:description", content: "שריינו סטודיו צילום בבית שמש — יומן פתוח, חבילת בוקר, ומחירון שקוף." },
      { property: "og:url", content: "https://sweetbabyphotographystudio.lovable.app/booking" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/booking" }],
  }),
});

function slotsForDate(d: Date, closures: { date: string; closed: boolean; open_time: string | null; close_time: string | null }[]): string[] {
  const iso = d.toISOString().slice(0, 10);
  const closure = closures.find((c) => c.date === iso);
  const day = d.getDay();
  let openMin = 8 * 60;
  let closeMin = 23 * 60;
  if (day === 5) closeMin = 15 * 60;
  if (day === 6) openMin = 20 * 60;
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

// Group slots by daypart for readability.
function groupSlots(list: string[]) {
  const morning: string[] = [];
  const afternoon: string[] = [];
  const evening: string[] = [];
  for (const s of list) {
    const h = Number(s.slice(0, 2));
    if (h < 12) morning.push(s);
    else if (h < 17) afternoon.push(s);
    else evening.push(s);
  }
  return { morning, afternoon, evening };
}

function Booking() {
  const { user } = useAuth();
  const nav = useNavigate();
  const place = useServerFn(placeBooking);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [existing, setExisting] = useState<Booking[]>([]);
  const [closures, setClosures] = useState<{ date: string; closed: boolean; open_time: string | null; close_time: string | null }[]>([]);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [slots, setSlots] = useState(2);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("studio_closures").select("*").then(({ data }) => setClosures((data as typeof closures) ?? []));
  }, []);

  useEffect(() => {
    if (!date) return;
    const iso = date.toISOString().slice(0, 10);
    supabase
      .from("booking_busy_slots" as never)
      .select("start_time, end_time")
      .eq("session_date", iso)
      .then(({ data }) => setExisting(((data as unknown) as Booking[]) ?? []));
    setStartTime(null);
  }, [date]);

  const daySlots = useMemo(() => (date ? slotsForDate(date, closures) : []), [date, closures]);
  const grouped = useMemo(() => groupSlots(daySlots), [daySlots]);

  const price = useMemo(() => {
    if (!startTime) return 0;
    try { return computeStudioPrice(slots, startTime); } catch { return 0; }
  }, [startTime, slots]);

  const endTimeStr = useMemo(() => {
    if (!startTime) return null;
    const [h, m] = startTime.split(":").map(Number);
    const endMin = h * 60 + m + slots * 30;
    return `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
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
      nav({ to: "/summary/$type/$id", params: { type: "booking", id: res.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשריון");
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-[#f8ede4]">
        <Header />
        <section className="container-page py-24 flex-1" dir="rtl">
          <div className="max-w-md mx-auto text-center bg-white rounded-3xl p-10 border border-[#2d3d2b]/10 shadow-sm">
            <Lock className="h-8 w-8 text-[#6b8a63] mx-auto mb-3" />
            <h2 className="font-display text-3xl text-[#2d3d2b] mb-2">התחברות נדרשת</h2>
            <p className="text-[#2d3d2b]/60 text-sm mb-6">כדי לשריין את הסטודיו יש להיכנס לחשבון.</p>
            <Link to="/auth" search={{ redirect: "/booking" }}>
              <Button className="rounded-full w-full bg-[#2d3d2b] hover:bg-[#1f2b1e] text-[#f8ede4]">התחברות</Button>
            </Link>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  const dayName = date?.toLocaleDateString("he-IL", { weekday: "long" });

  return (
    <div className="min-h-screen flex flex-col bg-[#f8ede4]" dir="rtl">
      <Header />
      <section className="container-page py-10 md:py-14 flex-1">
        {/* Header */}
        <div className="max-w-3xl mb-8">
          <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.32em] uppercase text-[#6b8a63] mb-3">
            <CalendarDays className="h-3.5 w-3.5" /> Studio Booking
          </div>
          <h1 className="font-display text-4xl md:text-5xl text-[#2d3d2b] leading-tight">
            שריון <em className="not-italic text-[#6b8a63]">היומן</em>
          </h1>
          <p className="mt-3 text-sm md:text-base text-[#2d3d2b]/70 max-w-2xl">
            בחרי תאריך, סמני שעה פנויה, וקבעי את משך השריון. השריון נכנס אוטומטית ליומן.
          </p>
        </div>

        <form onSubmit={submit} className="grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)_320px] gap-5 items-start">
          {/* Calendar */}
          <div className="bg-white rounded-2xl border border-[#2d3d2b]/8 p-3 shadow-sm">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              locale={he}
              disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              className="rounded-xl"
            />
          </div>

          {/* Time picker */}
          <div className="bg-white rounded-2xl border border-[#2d3d2b]/8 p-5 md:p-6 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <h2 className="font-display text-2xl text-[#2d3d2b]">בחירת שעה</h2>
              {date && (
                <div className="text-xs text-[#2d3d2b]/60">
                  {dayName} · {date.toLocaleDateString("he-IL", { day: "numeric", month: "long" })}
                </div>
              )}
            </div>
            <p className="text-xs text-[#2d3d2b]/55 mb-5">
              מינימום שעה (2 חצאי שעות). חבילת בוקר 08:00–11:00 · 240₪.
            </p>

            {!date && (
              <div className="text-[#2d3d2b]/50 text-sm py-16 text-center border-2 border-dashed border-[#2d3d2b]/10 rounded-xl">
                בחרי תאריך כדי לראות שעות פנויות
              </div>
            )}

            {date && daySlots.length === 0 && (
              <div className="text-[#2d3d2b]/60 text-sm py-14 text-center bg-[#f8ede4]/60 rounded-xl">
                אין שעות פעילות ביום זה
              </div>
            )}

            {date && daySlots.length > 0 && (
              <>
                {([
                  ["בוקר", grouped.morning],
                  ["צהריים", grouped.afternoon],
                  ["ערב", grouped.evening],
                ] as const).filter(([, arr]) => arr.length > 0).map(([label, arr]) => (
                  <div key={label} className="mb-4">
                    <div className="text-[10px] tracking-[0.28em] uppercase text-[#6b8a63] mb-2">{label}</div>
                    <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
                      {arr.map((s) => {
                        const taken = overlaps(s, 1, existing);
                        const selected = startTime === s;
                        return (
                          <button
                            type="button"
                            key={s}
                            disabled={taken}
                            onClick={() => setStartTime(s)}
                            className={`h-9 rounded-lg text-xs font-medium border transition-all ${
                              taken
                                ? "opacity-25 line-through cursor-not-allowed border-[#2d3d2b]/10 bg-[#f8ede4]/50"
                                : selected
                                ? "bg-[#2d3d2b] text-[#f8ede4] border-[#2d3d2b] shadow-md scale-105"
                                : "border-[#2d3d2b]/12 hover:border-[#6b8a63] hover:bg-[#a8c4a2]/10 text-[#2d3d2b] bg-white"
                            }`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div className="border-t border-[#2d3d2b]/8 pt-4 mt-4">
                  <Label className="text-xs tracking-wide text-[#2d3d2b]/70">משך זמן</Label>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[2, 3, 4, 5, 6, 8].map((n) => {
                      const conflict = startTime ? overlaps(startTime, n, existing) : false;
                      const disabled = !startTime || conflict;
                      const active = slots === n;
                      const label = n === 2 ? "שעה" : n % 2 === 0 ? `${n / 2} שעות` : `${Math.floor(n / 2)}.5 שעות`;
                      return (
                        <button
                          type="button"
                          key={n}
                          disabled={disabled}
                          onClick={() => setSlots(n)}
                          className={`h-8 px-3 rounded-full text-xs border transition-colors ${
                            disabled
                              ? "opacity-30 cursor-not-allowed border-[#2d3d2b]/10"
                              : active
                              ? "bg-[#6b8a63] text-white border-[#6b8a63]"
                              : "border-[#2d3d2b]/15 hover:border-[#6b8a63] bg-white text-[#2d3d2b]"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Summary + contact */}
          <aside className="space-y-4 lg:sticky lg:top-24">
            <div className="bg-white rounded-2xl border border-[#2d3d2b]/8 p-5 space-y-3 shadow-sm">
              <h3 className="font-display text-lg text-[#2d3d2b]">פרטי יצירת קשר</h3>
              <div>
                <Label className="text-xs text-[#2d3d2b]/70">שם מלא *</Label>
                <Input required value={contactName} onChange={(e) => setContactName(e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-[#2d3d2b]/70">טלפון *</Label>
                <Input required type="tel" dir="ltr" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-[#2d3d2b]/70">הערות</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 text-sm" />
              </div>
              <label className="flex items-start gap-2 text-[11px] text-[#2d3d2b]/70 cursor-pointer leading-relaxed">
                <Checkbox checked={terms} onCheckedChange={(v) => setTerms(!!v)} className="mt-0.5" />
                <span>אישרתי את תנאי הסטודיו ושליחת הסכם תיאום הציפיות בעמוד השכרת הסטודיו.</span>
              </label>
            </div>

            <div className="bg-[#2d3d2b] text-[#f8ede4] rounded-2xl p-5 shadow-lg">
              <div className="text-[10px] tracking-[0.32em] uppercase text-[#f5d5cf] mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> סיכום
              </div>
              <div className="flex items-center gap-2 text-xs text-[#f8ede4]/70 mb-3">
                <Clock className="h-3.5 w-3.5 text-[#f5d5cf]" />
                {date ? date.toLocaleDateString("he-IL", { day: "numeric", month: "long" }) : "לא נבחר תאריך"}
                {startTime && ` · ${startTime}${endTimeStr ? `–${endTimeStr}` : ""}`}
              </div>
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-[#f8ede4]/70 text-xs">סה״כ</span>
                <span className="font-display text-3xl text-[#f5d5cf]">₪{price}</span>
              </div>
              <div className="text-[10px] text-[#f8ede4]/55 mb-4">מתוכם 90₪ מקדמה לשריון</div>
              <Button
                type="submit"
                disabled={!canBook || busy}
                className="w-full rounded-full h-11 bg-[#f5d5cf] text-[#2d3d2b] hover:bg-[#f8ede4] font-medium disabled:opacity-40"
              >
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

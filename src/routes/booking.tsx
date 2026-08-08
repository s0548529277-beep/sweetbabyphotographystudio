import { heError } from "@/lib/he-errors";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { useAuth } from "@/lib/auth";
import { useProfilePrefill } from "@/hooks/use-profile";
import { saveContactHandoff } from "@/lib/contact-handoff";

import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  placeBooking,
  computeStudioPrice,
  isMorningPackage,
  GUIDANCE_FEES,
  GUIDANCE_LABELS,
  MORNING_PACKAGE_STARTS,
  MORNING_PACKAGE_PRICE,
} from "@/lib/bookings.functions";
import { checkItemsAvailability } from "@/lib/orders.functions";
import { getStudioDayBusy } from "@/lib/studio-availability.functions";

import { toast } from "sonner";
import { he } from "date-fns/locale";
import { Lock, Clock, Sparkles, CalendarDays, Package, X, Search } from "lucide-react";
import { useCatalogItems, type CatalogItem } from "@/lib/catalog";
import { GuestContinueButton } from "@/components/GuestContinueButton";


type CatItem = CatalogItem;

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export const Route = createFileRoute("/booking")({
  component: Booking,
  head: () => ({
    meta: [
      { title: "שריון סטודיו | Sweetbaby" },
      { name: "description", content: "שריינו סטודיו צילום בבית שמש — Sweetbaby מציעה יומן פתוח, חבילות בוקר ומחירון שקוף לצילומי ניוברן ומשפחה." },
      { property: "og:title", content: "שריון סטודיו | Sweetbaby" },
      { property: "og:description", content: "שריינו סטודיו צילום בבית שמש — יומן פתוח, חבילת בוקר, ומחירון שקוף." },
      { property: "og:url", content: "https://sweetbabyphoto.shop/booking" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphoto.shop/booking" }],
  }),
});

function slotsForDate(d: Date, closures: { date: string; closed: boolean; open_time: string | null; close_time: string | null }[]): string[] {
 const iso = toLocalISODate(d);
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
  const profile = useProfilePrefill();
  const nav = useNavigate();
  const place = useServerFn(placeBooking);
  const checkAvail = useServerFn(checkItemsAvailability);
  const dayBusy = useServerFn(getStudioDayBusy);

  // Live catalog — reflects edits made in /admin/items right away.
  const ALL_PROPS: CatItem[] = useCatalogItems();
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [existing, setExisting] = useState<Booking[]>([]);
  const [closures, setClosures] = useState<{ date: string; closed: boolean; open_time: string | null; close_time: string | null }[]>([]);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [slots, setSlots] = useState(2);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [reservedSkus, setReservedSkus] = useState<string[]>([]);
  const [propQuery, setPropQuery] = useState("");
  const [showPropPicker, setShowPropPicker] = useState(false);
  const [propAvail, setPropAvail] = useState<Record<string, { available: number }> | null>(null);
  const [propAvailLoading, setPropAvailLoading] = useState(false);

  // Live prop availability for the chosen date — same source of truth as the
  // rental-catalog / checkout inventory (items + item_availability).
  useEffect(() => {
    if (!date) { setPropAvail(null); return; }
    const iso = toLocalISODate(date);
    let cancelled = false;
    setPropAvailLoading(true);
    checkAvail({ data: { skus: ALL_PROPS.map((p) => p.sku), from: iso, to: iso } })
      .then((r) => { if (!cancelled) setPropAvail(r); })
      .catch(() => { if (!cancelled) setPropAvail(null); })
      .finally(() => { if (!cancelled) setPropAvailLoading(false); });
    return () => { cancelled = true; };
  }, [date, checkAvail, ALL_PROPS]);

  // Drop props that became unavailable for the newly picked date.
  useEffect(() => {
    if (!propAvail) return;
    setReservedSkus((prev) => {
      const next = prev.filter((s) => (propAvail[s]?.available ?? 0) > 0);
      if (next.length !== prev.length) toast.info("חלק מהאביזרים ששוריינו תפוסים בתאריך שנבחר והוסרו מהרשימה.");
      return next.length === prev.length ? prev : next;
    });
  }, [propAvail]);

  // Prefill contact details from the customer's personal area.
  useEffect(() => {
    if (!profile.loaded) return;
    setContactName((v) => v || profile.fullName);
    setContactPhone((v) => v || profile.phone);
    setContactEmail((v) => v || (user?.email ?? ""));
  }, [profile.loaded, profile.fullName, profile.phone, user]);



  const filteredProps = useMemo(() => {
    const q = propQuery.trim().toLowerCase();
    if (!q) return ALL_PROPS.slice(0, 40);
    return ALL_PROPS.filter((p) =>
      p.sku.includes(q) || (p.name || "").toLowerCase().includes(q) || (p.alt || "").toLowerCase().includes(q),
    ).slice(0, 60);
  }, [propQuery, ALL_PROPS]);
  const toggleSku = (sku: string) =>
    setReservedSkus((prev) =>
      prev.includes(sku) ? prev.filter((s) => s !== sku) : prev.length >= 20 ? prev : [...prev, sku],
    );

  useEffect(() => {
    supabase.from("studio_closures").select("*").then(({ data }) => setClosures((data as typeof closures) ?? []));
  }, []);

  useEffect(() => {
    if (!date) return;
    const iso = toLocalISODate(date);
    let cancelled = false;
    // Busy time = app bookings + real Google Calendar events (prop pickups are
    // marked "free" there, so they never block the studio).
    dayBusy({ data: { date: iso } })
      .then((rows: Booking[]) => { if (!cancelled) setExisting(rows); })
      .catch(async () => {
        const { data: rows } = await supabase
          .from("booking_busy_slots" as never)
          .select("start_time, end_time")
          .eq("session_date", iso);
        if (!cancelled) setExisting(((rows as unknown) as Booking[]) ?? []);
      });
    setStartTime(null);
    return () => { cancelled = true; };
  }, [date, dayBusy]);


  const daySlots = useMemo(() => (date ? slotsForDate(date, closures) : []), [date, closures]);
  const grouped = useMemo(() => groupSlots(daySlots), [daySlots]);

  
  const guidanceKey = (profile.guidance || "basic") as keyof typeof GUIDANCE_FEES;
  const guidanceFee = GUIDANCE_FEES[guidanceKey] ?? 0;

  const basePrice = useMemo(() => {
    if (!startTime) return 0;
    try { return computeStudioPrice(slots, startTime); } catch { return 0; }
  }, [startTime, slots]);
  const price = basePrice > 0 ? basePrice + guidanceFee : 0;

  // Discount code (e.g. BYBY10 / SWEETBABY10 → 10%)
  const [coupon, setCoupon] = useState("");
  const [couponOff, setCouponOff] = useState(0);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const finalPrice = Math.max(0, price - couponOff);

  const applyCoupon = async () => {
    const code = coupon.trim().toUpperCase();
    if (!code) return;
    if (price <= 0) { setCouponMsg("בחרי קודם תאריך ושעה"); return; }
    const { data } = await supabase
      .from("coupons")
      .select("code, discount_percent, discount_amount, active, expires_at")
      .eq("code", code)
      .maybeSingle();
    const valid = data && data.active && (!data.expires_at || new Date(data.expires_at) > new Date());
    if (!valid) { setCouponOff(0); setCouponMsg("קוד לא תקף"); return; }
    const off = Math.min(
      price,
      Math.round((price * (Number(data!.discount_percent) || 0)) / 100 + (Number(data!.discount_amount) || 0)),
    );
    setCouponOff(off);
    setCouponMsg(`הקוד הופעל · הנחה ₪${off}`);
  };

  const morningActive = !!startTime && isMorningPackage(slots, startTime);

  const endTimeStr = useMemo(() => {
    if (!startTime) return null;
    const [h, m] = startTime.split(":").map(Number);
    const endMin = h * 60 + m + slots * 30;
    return `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  }, [startTime, slots]);

  const canBook = date && startTime && slots >= 2 && contactName && contactPhone && user;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !startTime) return;
    setBusy(true);
    saveContactHandoff({ fullName: contactName, phone: contactPhone });
    try {
      const res = await place({
        data: {
         session_date: toLocalISODate(date),
          start_time: startTime,
          slots,
          contact_name: contactName,
          contact_phone: contactPhone,
          contact_email: contactEmail.trim() ? contactEmail.trim() : null,

          notes,
          reserved_items: reservedSkus,
          guidance: guidanceKey,
          coupon: coupon.trim() ? coupon.trim().toUpperCase() : null,

          terms_accepted: true as const,
        },
      });
      toast.success("השריון נוצר! ממשיכות לתשלום המקדמה.");
      nav({ to: "/summary/$type/$id", params: { type: "booking", id: res.id } });
    } catch (err) {
      toast.error(heError(err, "שגיאה בשריון"));
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
            <h2 className="font-display text-3xl text-[#2d3d2b] mb-2">התחברות או מצב אורח</h2>
            <p className="text-[#2d3d2b]/60 text-sm mb-6">אפשר להתחבר לחשבון, או להמשיך לשריון ללא הרשמה.</p>
            <Link to="/auth" search={{ redirect: "/booking" }}>
              <Button className="rounded-full w-full bg-[#2d3d2b] hover:bg-[#1f2b1e] text-[#f8ede4]">התחברות</Button>
            </Link>
            <div className="mt-3">
              <GuestContinueButton />
            </div>
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
            <p className="text-xs text-[#2d3d2b]/55 mb-4">
              מינימום שעה (2 חצאי שעות).
              {` חבילת בוקר ניו-בורן — 3 שעות מלאות ב-₪${MORNING_PACKAGE_PRICE}, בחלונות 08:00, 09:00 או 10:00 (עד 13:00). בחירה בחבילה משריינת אוטומטית 3 שעות ביומן.`}
            </p>

            {date && (
              <div className="mb-5 rounded-2xl border border-[#e8b4bc] bg-[#e8b4bc]/15 p-4">
                <div className="text-[10px] tracking-[0.28em] uppercase text-[#6b8a63] mb-2">
                  חבילת ניו-בורן · 3 שעות · ₪{MORNING_PACKAGE_PRICE}
                </div>

                <div className="flex flex-wrap gap-2">
                  {MORNING_PACKAGE_STARTS.map((s) => {
                    const taken = overlaps(s, 6, existing) || !daySlots.includes(s);
                    const active = startTime === s && slots === 6;
                    const [hh] = s.split(":").map(Number);
                    return (
                      <button
                        type="button"
                        key={s}
                        disabled={taken}
                        onClick={() => { setStartTime(s); setSlots(6); }}
                        className={`h-9 px-4 rounded-full text-xs font-medium border transition-all ${
                          taken
                            ? "opacity-30 line-through cursor-not-allowed border-[#2d3d2b]/10"
                            : active
                            ? "bg-[#2d3d2b] text-[#f8ede4] border-[#2d3d2b] shadow-md"
                            : "bg-white border-[#e8b4bc] text-[#2d3d2b] hover:bg-[#e8b4bc]/30"
                        }`}
                      >
                        {s}–{String(hh + 3).padStart(2, "0")}:00
                      </button>
                    );
                  })}
                </div>
              </div>
            )}


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

          {/* Summary */}
          <aside className="space-y-4 lg:sticky lg:top-24">
            <div className="bg-white rounded-2xl border border-[#2d3d2b]/8 p-5 space-y-3 shadow-sm">
              <h3 className="font-display text-lg text-[#2d3d2b]">הערות לשריון</h3>
              <div>
                <Label className="text-xs text-[#2d3d2b]/70">אימייל לקבלת הזמנה ליומן</Label>
                <Input
                  type="email"
                  dir="ltr"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1 text-sm"
                />
                <p className="text-[11px] text-[#2d3d2b]/60 mt-1">נשלח אליך אישור והזמנה לאירוע ביומן Google.</p>
              </div>
              <div>
                <Label className="text-xs text-[#2d3d2b]/70">הערות (אופציונלי)</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 text-sm" />
              </div>

            </div>


            {/* Reserve props (free with studio rental — up to 20) */}
            <div className="bg-white rounded-2xl border border-[#2d3d2b]/8 p-5 shadow-sm">
              <button
                type="button"
                onClick={() => setShowPropPicker((v) => !v)}
                className="w-full flex items-center justify-between gap-2 text-right"
              >
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-[#a8c4a2]/25 flex items-center justify-center">
                    <Package className="h-4 w-4 text-[#6b8a63]" />
                  </div>
                  <div>
                    <div className="font-display text-lg text-[#2d3d2b]">שריון אביזרים · חינם (אופציונלי)</div>
                    <div className="text-[11px] text-[#2d3d2b]/60">עד 20 אביזרים שריון כלולים בהשכרת הסטודיו — אפשר גם לדלג</div>
                  </div>
                </div>
                <span className="text-xs text-[#6b8a63] font-medium">
                  {reservedSkus.length}/20 {showPropPicker ? "▲" : "▼"}
                </span>
              </button>

              {reservedSkus.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {reservedSkus.map((sku) => {
                    const it = ALL_PROPS.find((p) => p.sku === sku);
                    return (
                      <span key={sku} className="inline-flex items-center gap-1 bg-[#f5d5cf]/60 text-[#2d3d2b] text-[11px] px-2 py-1 rounded-full">
                        #{sku} {it?.name || it?.alt || ""}
                        <button type="button" onClick={() => toggleSku(sku)} className="hover:text-[#8b3a2a]">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {showPropPicker && (
                <div className="mt-4 border-t border-[#2d3d2b]/8 pt-4">
                  <div className="relative mb-3">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#6b8a63]" />
                    <Input
                      placeholder="חיפוש לפי שם או מק״ט…"
                      value={propQuery}
                      onChange={(e) => setPropQuery(e.target.value)}
                      className="h-9 text-sm pr-9"
                    />
                  </div>
                  <div className="mb-2 text-[11px] text-[#2d3d2b]/60">
                    {!date
                      ? "בחרו תאריך כדי לראות זמינות אמיתית לכל מק״ט."
                      : propAvailLoading
                      ? "בודקת זמינות מול המלאי…"
                      : propAvail
                      ? "הזמינות מסונכרנת עם מלאי השכרת האביזרים בזמן אמת."
                      : "לא הצלחנו לבדוק זמינות כרגע."}
                  </div>
                  <div className="max-h-60 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {filteredProps.map((p) => {
                      const on = reservedSkus.includes(p.sku);
                      const taken = !!date && !!propAvail && (propAvail[p.sku]?.available ?? 0) <= 0;
                      const disabled = taken || (!on && reservedSkus.length >= 20);
                      return (
                        <button
                          type="button"
                          key={p.sku}
                          disabled={disabled}
                          onClick={() => toggleSku(p.sku)}
                          className={`text-right text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                            on
                              ? "bg-[#a8c4a2]/30 border-[#6b8a63] text-[#2d3d2b] font-medium"
                              : disabled
                              ? "opacity-40 cursor-not-allowed border-[#2d3d2b]/10"
                              : "border-[#2d3d2b]/12 hover:border-[#6b8a63] bg-white text-[#2d3d2b]"
                          }`}
                        >
                          <span className="text-[#6b8a63]">#{p.sku}</span> {p.name || p.alt}
                          {taken && <span className="text-[10px] text-[#8b3a2a]"> · תפוס בתאריך זה</span>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-[#2d3d2b]/55 mt-2">
                    * שריון מותנה בזמינות ביום השריון. הצוות יאשר סופית בהודעת אישור.
                  </p>
                </div>
              )}
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
              {morningActive && (
                <div className="mb-2 text-[11px] text-[#f5d5cf]">חבילת ניו-בורן · 3 שעות</div>
              )}
              {guidanceFee > 0 && (
                <div className="flex items-baseline justify-between text-[11px] text-[#f8ede4]/70 mb-1">
                  <span>{GUIDANCE_LABELS[guidanceKey]}</span>
                  <span>+₪{guidanceFee}</span>
                </div>
              )}
              {couponOff > 0 && (
                <div className="flex items-baseline justify-between text-[11px] text-[#f5d5cf] mb-1">
                  <span>קוד קופון {coupon.trim().toUpperCase()}</span>
                  <span>-₪{couponOff}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-[#f8ede4]/70 text-xs">סה״כ</span>
                <span className="font-display text-3xl text-[#f5d5cf]">₪{finalPrice}</span>
              </div>

              {/* Discount code */}
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    value={coupon}
                    onChange={(e) => { setCoupon(e.target.value); setCouponOff(0); setCouponMsg(null); }}
                    placeholder="קוד קופון"
                    className="flex-1 h-9 rounded-full px-3 text-xs bg-[#f8ede4] text-[#2d3d2b] placeholder:text-[#2d3d2b]/40 outline-none"
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    className="h-9 px-4 rounded-full text-xs bg-[#f5d5cf] text-[#2d3d2b] font-medium"
                  >
                    החלה
                  </button>
                </div>
                {couponMsg && <div className="text-[10px] mt-1.5 text-[#f8ede4]/70">{couponMsg}</div>}
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

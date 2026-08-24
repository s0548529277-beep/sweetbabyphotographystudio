import { tool } from "ai";
import { z } from "zod";
import {
  findSkusByText,
  israelNow,
  nextAvailableDays,
  propsAvailability,
  studioAvailability,
} from "./availability.server";

const PRICE_FIRST_HOUR = 120;
const PRICE_EXTRA_HOUR = 90;
const MORNING_PRICE = 240;
// Must match GUIDANCE_FEES in bookings.functions.ts exactly — this used to
// say premium: 150 here while the real charge (and placeBooking) used 300,
// so the bot quoted customers a wrong price for premium guidance.
const GUIDANCE = { basic: 0, mini: 50, plus: 100, premium: 300 } as const;

/**
 * Tools that let the chat assistant answer availability questions for real,
 * and — for a logged-in customer who confirms she wants it — actually place
 * a studio booking through the exact same placeBooking used by /booking, so
 * a customer stuck on the page can still get booked instead of giving up.
 */
export function buildAssistantTools(opts?: { isAuthenticated?: boolean }) {
  return {
    check_studio_availability: tool({
      description:
        "בודק זמינות אמיתית של הסטודיו ליום מסוים — כולל שריונים באתר וגם אירועים ביומן גוגל של הסטודיו. תאריך בפורמט YYYY-MM-DD, ואופציונלית שעה HH:MM.",
      inputSchema: z.object({
        date: z.string().describe("YYYY-MM-DD"),
        time: z.string().optional().describe("HH:MM"),
        hours: z.number().optional().describe("כמה שעות רצופות צריך (ברירת מחדל 1)"),
      }),
      execute: async ({ date, time, hours }) => {
        const res = await studioAvailability(date, time);
        if (res.closed) return { date, closed: true, message: "הסטודיו סגור ביום זה" };
        const needed = Math.max(2, Math.round((hours ?? 1) * 2));
        let enoughFromRequested: boolean | null = null;
        if (time) {
          const [h, m] = time.slice(0, 5).split(":").map(Number);
          enoughFromRequested = Array.from({ length: needed }, (_, i) => {
            const t = h * 60 + m + i * 30;
            return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
          }).every((s) => res.freeSlots.includes(s));
        }
        return {
          date,
          closed: false,
          requestedTime: time ?? null,
          requestedTimeFree: time ? res.wantedFree : null,
          enoughConsecutiveTime: enoughFromRequested,
          freeSlots: res.freeSlots,
          calendarLinked: res.calendarLinked ?? true,
        };
      },
    }),

    find_next_available_days: tool({
      description:
        "מחפש את התאריכים הקרובים שבהם הסטודיו פנוי למשך מספר שעות מבוקש. שימושי כששואלים 'מתי פנוי?' בלי תאריך מדויק.",
      inputSchema: z.object({
        from: z.string().optional().describe("YYYY-MM-DD, ברירת מחדל היום"),
        hours: z.number().optional().describe("כמה שעות רצופות, ברירת מחדל 1"),
      }),
      execute: async ({ from, hours }) => {
        const start = from || israelNow().date;
        const days = await nextAvailableDays(start, hours ?? 1, 21, 5);
        return { from: start, hours: hours ?? 1, options: days };
      },
    }),

    check_prop_availability: tool({
      description:
        "בודק זמינות אמיתית של אביזר להשכרה לפי מק״ט או לפי שם/תיאור בעברית, בטווח תאריכים.",
      inputSchema: z.object({
        query: z.string().describe("מק״ט או שם האביזר"),
        from: z.string().describe("YYYY-MM-DD"),
        to: z.string().optional().describe("YYYY-MM-DD"),
      }),
      execute: async ({ query, from, to }) => {
        const matches = findSkusByText(query, 6);
        if (matches.length === 0) return { found: false, message: "לא נמצא אביזר תואם בקטלוג" };
        const res = await propsAvailability(matches.map((m) => m.sku), from, to || from);
        return {
          found: true,
          range: { from, to: to || from },
          items: res.map((r) => ({ sku: r.sku, name: r.name, available: r.available > 0 })),
        };
      },
    }),

    search_catalog: tool({
      description: "מחפש אביזרים בקטלוג לפי תיאור בעברית ומחזיר מק״טים, שמות ומחירים (בלי בדיקת זמינות).",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const items = findSkusByText(query, 8);
        return {
          count: items.length,
          items: items.map((i) => ({ sku: i.sku, name: i.name || i.alt, price: i.price })),
        };
      },
    }),

    quote_studio_price: tool({
      description:
        "מחשב מחיר מדויק להשכרת הסטודיו לפי משך וזמן התחלה, כולל מבצע ניו-בורן בוקר ותוספת הדרכה.",
      inputSchema: z.object({
        hours: z.number().describe("משך בשעות, אפשר 1.5"),
        startTime: z.string().optional().describe("HH:MM"),
        guidance: z.enum(["basic", "mini", "plus", "premium"]).optional(),
        newborn: z.boolean().optional().describe("האם מדובר בצילומי ניו-בורן"),
      }),
      execute: async ({ hours, startTime, guidance, newborn }) => {
        const slots = Math.max(2, Math.round(hours * 2));
        const start = startTime?.slice(0, 5);
        const morningStarts = ["08:00", "09:00", "10:00"];
        const isMorning = !!newborn && slots === 6 && !!start && morningStarts.includes(start);
        const base = isMorning
          ? MORNING_PRICE
          : Math.min(slots, 2) * (PRICE_FIRST_HOUR / 2) + Math.max(0, slots - 2) * (PRICE_EXTRA_HOUR / 2);
        const add = GUIDANCE[guidance ?? "basic"];
        return {
          hours: slots / 2,
          package: isMorning ? "מבצע ניו-בורן בוקר (3 שעות)" : "רגיל",
          basePrice: base,
          guidanceFee: add,
          total: base + add,
          deposit: 90,
        };
      },
    }),

    current_datetime: tool({
      description: "מחזיר את התאריך והשעה הנוכחיים בישראל — להמרת 'מחר', 'שבוע הבא' וכו׳ לתאריך מלא.",
      inputSchema: z.object({}),
      execute: async () => israelNow(),
    }),

    list_active_coupons: tool({
      description:
        "מחזירה את קודי הקופון הכלליים הפעילים כרגע במסד הנתונים (לא קודים אישיים חד-פעמיים שנשלחו למישהי ספציפית). תמיד השתמשי בזה לפני שאת מזכירה קוד קופון ללקוחה — אסור להמציא או להיזכר בקוד ישן, קודי הקופון משתנים.",
      inputSchema: z.object({}),
      execute: async () => {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data, error } = await supabase
          .from("coupons")
          .select("code, discount_percent, discount_amount, expires_at")
          .eq("active", true)
          .eq("single_use", false);
        if (error || !data?.length) return { coupons: [] };
        const now = Date.now();
        const live = data.filter((c) => !c.expires_at || new Date(c.expires_at).getTime() > now);
        return { coupons: live.map((c) => ({ code: c.code, discountPercent: c.discount_percent, discountAmount: c.discount_amount })) };
      },
    }),

    create_studio_booking: tool({
      description: `יוצרת שריון סטודיו אמיתי (לא רק בדיקה!) עבור לקוחה שמתקשה להשלים את התהליך לבד באתר. זה כלי רציני — לפני שמשתמשים בו חובה:
1. לבדוק זמינות אמיתית עם check_studio_availability ולוודא שהתאריך/שעה באמת פנויים.
2. לקבל מהלקוחה בפירוש: שם מלא וטלפון.
3. לקבל מהלקוחה אישור מפורש בהודעה בצ'אט שהיא מסכימה לתנאי השימוש (יש קישור בעמוד /terms) ושהיא מבינה שצריך לשלם מקדמה של 90₪ (לא מוחזרת בביטול) בהעברה בנקאית/ביט כדי לשריין בפועל — ורק אז לשלוח termsAccepted=true.
${!opts?.isAuthenticated ? "הלקוחה הנוכחית לא מחוברת — אסור לקרוא לכלי הזה, יש להציע לה להתחבר קודם ב-/auth ואז לחזור." : "הלקוחה מחוברת, אפשר להשתמש בכלי אחרי שהתנאים לעיל התקיימו."}
השריון נוצר במצב 'ממתין' — עדיין דורש תשלום מקדמה כדי להתאשר סופית, בדיוק כמו הזמנה רגילה דרך /booking.`,
      inputSchema: z.object({
        date: z.string().describe("YYYY-MM-DD"),
        startTime: z.string().describe("HH:MM"),
        hours: z.number().describe("משך בשעות, אפשר 1.5"),
        contactName: z.string(),
        contactPhone: z.string(),
        guidance: z.enum(["basic", "mini", "plus", "premium"]).optional(),
        notes: z.string().optional(),
        termsAccepted: z.boolean().describe("true רק אם הלקוחה אישרה בפירוש בהודעה בצ'אט את התנאים והמקדמה"),
      }),
      execute: async (args) => {
        if (!opts?.isAuthenticated) {
          return { ok: false, message: "הלקוחה לא מחוברת — אי אפשר ליצור עבורה שריון. יש להציע לה להתחבר ב-/auth ואז לנסות שוב." };
        }
        if (!args.termsAccepted) {
          return { ok: false, message: "חסר אישור מפורש מהלקוחה לתנאי השימוש ולמקדמה — יש לבקש את זה קודם, לא ליצור שריון בלי אישור." };
        }
        try {
          const { placeBooking } = await import("./bookings.functions");
          const slots = Math.max(2, Math.round(args.hours * 2));
          const res = await placeBooking({
            data: {
              session_date: args.date,
              start_time: args.startTime.slice(0, 5),
              slots,
              contact_name: args.contactName,
              contact_phone: args.contactPhone,
              contact_email: null,
              notes: args.notes || null,
              guidance: args.guidance ?? "basic",
              terms_accepted: true,
            },
          });
          return {
            ok: true,
            bookingId: res.id,
            price: res.price,
            deposit: res.deposit,
            message: "השריון נוצר במצב ממתין לתשלום מקדמה. חשוב להפנות את הלקוחה עכשיו לעמוד סיכום ההזמנה כדי שתשלים את תשלום המקדמה ותאשר את השריון סופית.",
          };
        } catch (e: any) {
          return {
            ok: false,
            message: `יצירת השריון נכשלה: ${e?.message ?? "שגיאה לא צפויה"}. אפשר להציע ללקוחה לנסות ישירות דרך /booking, או להפנות אותה ליצירת קשר עם הסטודיו.`,
          };
        }
      },
    }),
  };
}

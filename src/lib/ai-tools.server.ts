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
const GUIDANCE = { basic: 0, mini: 50, plus: 100, premium: 150 } as const;

/** Tools that let the chat assistant answer availability questions for real. */
export function buildAssistantTools() {
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
  };
}

import { tool } from "ai";
import { z } from "zod";
import { findSkusByText, propsAvailability, studioAvailability } from "./availability.server";

/** Tools that let the chat assistant answer availability questions for real. */
export function buildAssistantTools() {
  return {
    check_studio_availability: tool({
      description:
        "בודק זמינות אמיתית של הסטודיו ליום מסוים ביומן. יש להעביר תאריך בפורמט YYYY-MM-DD, ואופציונלית שעה HH:MM.",
      inputSchema: z.object({
        date: z.string().describe("YYYY-MM-DD"),
        time: z.string().optional().describe("HH:MM"),
      }),
      execute: async ({ date, time }) => {
        const res = await studioAvailability(date, time);
        if (res.closed) return { date, closed: true, message: "הסטודיו סגור ביום זה" };
        return {
          date,
          closed: false,
          requestedTime: time ?? null,
          requestedTimeFree: time ? res.wantedFree : null,
          freeSlots: res.freeSlots,
        };
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
  };
}

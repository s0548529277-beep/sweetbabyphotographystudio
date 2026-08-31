import { tool } from "ai";
import { z } from "zod";
import {
  findSkusByText,
  israelNow,
  nextAvailableDays,
  propsAvailability,
  studioAvailability,
} from "./availability.server";
import { STUDIO_GUIDE_HE } from "./studio-guide.server";
import { ARRIVAL_TEXT_HE } from "./arrival";
import { PHOTOGRAPHY_SERVICE_TEXT_HE } from "./photography-options";

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
      // Any failure here (a Supabase hiccup, a slow/broken Google Calendar
      // read that studioAvailability itself didn't manage to swallow) used
      // to throw straight out of the tool call — on the phone that killed
      // the *entire* turn (the outer route handler's catch-all fired and
      // hung up on the caller with a generic "נתקלנו בתקלה"), even though
      // it was just one tool failing. Now it degrades to a soft result the
      // model can talk around instead of ending the call.
      execute: async ({ date, time, hours }) => {
        try {
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
        } catch (e) {
          console.error("[SWEETBABY] check_studio_availability failed", e);
          return {
            date,
            error: true,
            message: "בדיקת הזמינות נכשלה זמנית — אל תמציאי זמינות, תסבירי שיש תקלה זמנית בבדיקה ושהסטודיו יאשר בחזרה, או הציעי לנסות שוב עוד רגע.",
          };
        }
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
        try {
          const days = await nextAvailableDays(start, hours ?? 1, 21, 5);
          return { from: start, hours: hours ?? 1, options: days };
        } catch (e) {
          console.error("[SWEETBABY] find_next_available_days failed", e);
          return {
            from: start,
            hours: hours ?? 1,
            error: true,
            message: "בדיקת התאריכים הפנויים נכשלה זמנית — אל תמציאי תאריכים, תסבירי שיש תקלה זמנית ושהסטודיו יחזור עם תאריכים בקרוב, או הציעי לנסות שוב עוד רגע.",
          };
        }
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

    get_equipment_guide: tool({
      description:
        "מחזירה את מדריך השימוש הרשמי בציוד הסטודיו (משדר, פלאש, מצלמה, רקעים, רצפות עץ). קרא/י לזה רק כשלקוחה שואלת שאלה ספציפית על ציוד/הפעלה, או מדווחת על תקלה — לא בכל שיחה.",
      inputSchema: z.object({}),
      execute: async () => ({ guide: STUDIO_GUIDE_HE }),
    }),

    get_arrival_directions: tool({
      description:
        "מחזירה הנחיות הגעה מלאות לסטודיו — כתובת ל-Waze, איך להגיע ברכב, וקווי אוטובוס + הליכה. קרא/י לזה רק כשלקוחה שואלת איך להגיע/דרכי הגעה — לא בכל שיחה.",
      inputSchema: z.object({}),
      execute: async () => ({ directions: ARRIVAL_TEXT_HE }),
    }),

    get_photography_service_info: tool({
      description:
        "מחזירה פרטים על שירות הצילום האישי של הצלמת מיכל סיבוני עצמה (ניו-בורן/משפחה בסטודיו או בחוץ) — שונה משכירת הסטודיו הרגילה. קרא/י לזה בכל פעם שעולה נושא צילומי ניו-בורן (גם בלי לשאול במפורש על מיכל/חבילה/אלבום — יש הטבה חשובה של 'סל לידה' שכדאי להזכיר ביוזמתך), וגם כשלקוחה שואלת 'את מצלמת?', 'סל לידה', 'צילומי חוץ/בטבע' וכו' — לא בכל שיחה אחרת.",
      inputSchema: z.object({}),
      execute: async () => ({ info: PHOTOGRAPHY_SERVICE_TEXT_HE }),
    }),

    current_datetime: tool({
      description: "מחזיר את התאריך והשעה הנוכחיים בישראל — להמרת 'מחר', 'שבוע הבא' וכו׳ לתאריך מלא.",
      inputSchema: z.object({}),
      execute: async () => israelNow(),
    }),

    // Hebrew-calendar-to-Gregorian conversion is real calendrical arithmetic
    // (variable month lengths, leap years on a 19-year Metonic cycle) — not
    // something to let the model guess at from its own "knowledge", which is
    // exactly the kind of task LLMs are unreliable at. @hebcal/hdate does the
    // real Rata Die conversion and accepts Hebrew month names in Hebrew
    // script directly (e.g. new HDate(25, 'כסלו', 5787)), so the model just
    // needs to pull day/month/year out of what the caller said in natural
    // language and hand them here — no manual math required on either side.
    hebrew_date_to_gregorian: tool({
      description:
        'ממירה תאריך עברי (יום בחודש + חודש עברי, למשל "כ\"ה בכסלו" או "ט\"ו בשבט", ושנה עברית אם נאמרה) לתאריך לועזי מדויק — תמיד להשתמש בכלי הזה כשלקוחה אומרת תאריך לפי הלוח העברי, ולעולם לא לנחש/לחשב את ההמרה לבד.',
      inputSchema: z.object({
        day: z.number().int().min(1).max(30).describe("היום בחודש העברי, מספר בין 1 ל-30 (למשל 25 עבור כ״ה)"),
        monthName: z.string().describe('שם החודש העברי בעברית, למשל "כסלו", "שבט", "ניסן", "אלול", "תשרי"'),
        year: z.number().int().optional().describe("שנה עברית (למשל 5787) אם נאמרה — אם לא, משתמשים בשנה העברית הנוכחית"),
      }),
      execute: async ({ day, monthName, year }) => {
        try {
          const { HDate } = await import("@hebcal/hdate");
          const hebrewYear = year ?? new HDate().getFullYear();
          const hd = new HDate(day, monthName, hebrewYear);
          return { ok: true, date: hd.greg().toISOString().slice(0, 10) };
        } catch (e: any) {
          return {
            ok: false,
            message: `לא הצלחתי להמיר את התאריך העברי (${e?.message ?? "שגיאה"}) — תבקשי מהלקוחה תאריך לועזי במקום, או תוודאי איתה שוב את היום/החודש/השנה העברית.`,
          };
        }
      },
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
      description: `יוצרת שריון סטודיו אמיתי (לא רק בדיקה!) עבור לקוחה עם חשבון אישי אמיתי שמתקשה להשלים את התהליך לבד באתר. זה כלי רציני — לפני שמשתמשים בו חובה:
1. לבדוק זמינות אמיתית עם check_studio_availability ולוודא שהתאריך/שעה באמת פנויים.
2. לקבל מהלקוחה בפירוש: שם מלא, טלפון, ואימייל (חובה — לשם יישלח אישור ההזמנה, בדיוק כמו בהזמנה רגילה).
3. לשאול (בקצרה, אפשר לדלג על מה שלא רלוונטי) את פרטי השאלון: סוג הצילום, כמה אנשים בערך, גיל התינוק/ת אם ניו-בורן, האם יש מצלמה/צריך המלצה, ניסיון עם פלאש, האם צריך אביזרים, בקשות מיוחדות.
4. להציג לה בהודעה בצ'אט (לא רק לינק) את התנאים המרכזיים ולקבל הסכמה מפורשת: מקדמה 90₪ שלא מוחזרת בביטול, ביטול ביום האירוע = 100%, נזק = עלות תיקון/רכישה +20% דמי טיפול, בלגן/ניקיון לא תקין = 150₪.
5. לשאול איך היא מתכננת לשלם את המקדמה (depositPlan).
${!opts?.isAuthenticated ? "הלקוחה הנוכחית היא אורחת/לא מחוברת בחשבון אמיתי — אסור בהחלט לקרוא לכלי הזה, יש להסביר בעדינות שצריך חשבון אישי אמיתי (לא כניסת אורח) וליצור/להתחבר ב-/auth, או להזמין לבד ב-/booking." : "הלקוחה מחוברת בחשבון אמיתי, אפשר להשתמש בכלי אחרי שכל התנאים לעיל התקיימו."}
השריון נוצר במצב 'ממתין' — עדיין דורש תשלום מקדמה כדי להתאשר סופית, בדיוק כמו הזמנה רגילה דרך /booking.`,
      inputSchema: z.object({
        date: z.string().describe("YYYY-MM-DD"),
        startTime: z.string().describe("HH:MM"),
        hours: z.number().describe("משך בשעות, אפשר 1.5"),
        contactName: z.string(),
        contactPhone: z.string(),
        contactEmail: z.string().min(3).describe("אימייל תקין — חובה, כדי שיישלחו כל המיילים כמו בהזמנה רגילה"),
        guidance: z.enum(["basic", "mini", "plus", "premium"]).optional(),
        sessionType: z.string().optional().describe("סוג הצילום, למשל משפחתי / ניו-בורן / חלאקה"),
        peopleCount: z.string().optional(),
        babyAge: z.string().optional(),
        cameraNeed: z.string().optional().describe("יש מצלמה משלה או צריכה המלצה"),
        flashExperience: z.string().optional(),
        needProps: z.string().optional().describe("האם מעוניינת גם באביזרים"),
        specialRequests: z.string().optional(),
        depositPlan: z.enum(["already_paid", "will_pay_now", "will_pay_later"]).describe("איך הלקוחה מתכננת/כבר שילמה את המקדמה"),
        notes: z.string().optional(),
        termsAccepted: z.boolean().describe("true רק אם הלקוחה אישרה בפירוש בהודעה בצ'אט את התנאים המרכזיים שהוצגו לה והמקדמה"),
      }),
      execute: async (args) => {
        if (!opts?.isAuthenticated) {
          return { ok: false, message: "הלקוחה אורחת / לא מחוברת בחשבון אמיתי — אי אפשר ליצור עבורה שריון דרך הצ'אט. יש להציע לה להתחבר/להירשם ב-/auth, או להזמין בעצמה כאורחת ב-/booking." };
        }
        if (!args.termsAccepted) {
          return { ok: false, message: "חסר אישור מפורש מהלקוחה לתנאים המרכזיים שהוצגו לה ולמקדמה — יש לבקש את זה קודם, לא ליצור שריון בלי אישור." };
        }
        try {
          const { placeBooking } = await import("./bookings.functions");
          const slots = Math.max(2, Math.round(args.hours * 2));
          const depositLabel = { already_paid: "כבר שילמה/העבירה", will_pay_now: "תשלם עכשיו", will_pay_later: "תשלם בהמשך" }[args.depositPlan];
          const res = await placeBooking({
            data: {
              session_date: args.date,
              start_time: args.startTime.slice(0, 5),
              slots,
              contact_name: args.contactName,
              contact_phone: args.contactPhone,
              contact_email: args.contactEmail || null,
              notes: [args.notes, `מקדמה (דרך הצ'אט): ${depositLabel}`].filter(Boolean).join("\n"),
              guidance: args.guidance ?? "basic",
              terms_accepted: true,
            },
          });

          // Best-effort — same questionnaire the /studio-rental page saves,
          // so this booking shows up in the admin exactly like a normal one.
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("studio_intake_forms").insert({
              booking_id: res.id,
              payload: {
                clientName: args.contactName,
                phone: args.contactPhone,
                email: args.contactEmail,
                sessionType: args.sessionType ?? "",
                peopleCount: args.peopleCount ?? "",
                babyAge: args.babyAge ?? "",
                cameraNeed: args.cameraNeed ?? "",
                flashExperience: args.flashExperience ?? "",
                needProps: args.needProps ?? "",
                specialRequests: args.specialRequests ?? "",
                guidance: args.guidance ?? "basic",
                source: "chat",
              },
            });
          } catch (e) {
            console.error("[SWEETBABY] chat-booking intake save failed", e);
          }

          return {
            ok: true,
            bookingId: res.id,
            price: res.price,
            deposit: res.deposit,
            message:
              "השריון נוצר במצב ממתין לתשלום מקדמה. חשוב להפנות את הלקוחה עכשיו לעמוד סיכום ההזמנה כדי שתשלים/תאשר את תשלום המקדמה — השריון מתאשר סופית רק אחרי שהמקדמה בפועל מתקבלת ומאושרת, אפשר לעקוב אחרי זה ב-/account.",
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

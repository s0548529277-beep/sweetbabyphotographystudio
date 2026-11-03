import { tool } from "ai";
import { z } from "zod";
import {
  findSkusByText,
  loadLiveCatalog,
  israelNow,
  nextAvailableDays,
  propsAvailability,
  studioAvailability,
} from "./availability.server";
import { STUDIO_GUIDE_HE } from "./studio-guide.server";
import { ARRIVAL_TEXT_HE } from "./arrival";
import { PHOTOGRAPHY_SERVICE_TEXT_HE } from "./photography-options";
import { computeStudioPrice } from "./bookings.functions";
import { publicChatPhotos } from "./chat-gallery";

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
/** Site paths the chat may render as buttons (show_buttons). Anything else is dropped. */
export const CHAT_BUTTON_PATHS = [
  "/booking",
  "/studio-rental",
  "/rental-catalog",
  "/cart",
  "/checkout",
  "/account",
  "/auth",
  "/contact",
  "/studio-photography",
  "/collage-maker",
  "/track",
] as const;

/**
 * Web-chat-only tools (site bot, 2026-10-27): buttons, the customer's own
 * personal-area data, and leaving a message for the studio. Not given to the
 * phone/WhatsApp bots — buttons mean nothing there and they'd only add tokens.
 */
export function buildWebChatTools(opts: { userId: string | null; isRealAccount: boolean }) {
  return {
    add_to_cart: tool({
      description:
        "מוסיפה אביזרים לעגלת הקניות של הלקוחה באתר (העגלה שלה מתעדכנת מיד והיא רואה אותם שם). קראי לזה כשהלקוחה אומרת שהיא רוצה/מזמינה/מוסיפה אביזר — אל תסתפקי בהצגת כרטיסים. המק״טים חייבים להגיע מ-search_catalog / check_prop_availability. הוספה לעגלה איננה הזמנה: הזמנה בפועל נעשית רק דרך create_props_order או בעמוד /cart.",
      inputSchema: z.object({
        items: z
          .array(z.object({ sku: z.string().min(1).max(40), quantity: z.number().int().min(1).max(10).optional() }))
          .min(1)
          .max(10),
      }),
      execute: async ({ items }) => {
        const catalog = await loadLiveCatalog();
        const added: Array<{ sku: string; name: string; price: number; quantity: number }> = [];
        const unknown: string[] = [];
        for (const it of items) {
          const found = catalog.find((c) => String(c.sku) === String(it.sku));
          if (!found) {
            unknown.push(it.sku);
            continue;
          }
          added.push({
            sku: String(found.sku),
            name: found.name || found.alt || String(found.sku),
            price: Number(found.price ?? 0),
            quantity: it.quantity ?? 1,
          });
        }
        return {
          ok: added.length > 0,
          added,
          ...(unknown.length ? { unknownSkus: unknown, message: "חלק מהמק״טים לא נמצאו בקטלוג — חפשי אותם שוב עם search_catalog." } : {}),
        };
      },
    }),

    show_gallery_photos: tool({
      description: "מציגה תמונות אמיתיות מהגלריה הציבורית בתוך הצ׳אט. חובה כשמבקשים תמונות, דוגמאות או השראה לצילומים; לא לשלוח רק קישור. לא תמונות פרטיות של לקוחות.",
      inputSchema: z.object({
        category: z.enum(["newborn", "cake-smash", "upsherin", "family", "studio-outdoor", "bat-mitzvah", "albums"]),
      }),
      execute: async ({ category }) => {
        const { supabase } = await import("@/integrations/supabase/client");
        const pages = category === "newborn" ? ["portfolio-newborn", "newborn"] : [`portfolio-${category}`];
        const { data, error } = await supabase.from("page_images")
          .select("url, caption, page, source, hidden")
          .in("page", pages).order("sort_order").order("created_at");
        if (error) throw new Error("לא הצלחתי לקרוא את הגלריה הציבורית כרגע.");
        const photos = publicChatPhotos(data ?? []);
        return { photos, href: "/studio-photography", found: photos.length > 0 };
      },
    }),
    offer_guest_continue: tool({
      description:
        "מציגה בצ'אט כפתורים 'להמשיך כאורחת (בלי הרשמה)' ו'להתחברות' — לקרוא לכלי כשלקוחה שעוד לא מחוברת רוצה להזמין סטודיו או אביזרים בצ'אט. אחרי הקריאה הסבירי במשפט אחד שאפשר להמשיך כאן בצ'אט בלי הרשמה ובלי לצאת (ההזמנה תישמר במצב אורחת ותקבל מייל אישור), וחכי שהיא תלחץ ותאשר. לא לקרוא לכלי כשהיא כבר מחוברת.",
      inputSchema: z.object({}),
      execute: async () =>
        opts.userId
          ? { shown: false, message: "הלקוחה כבר מחוברת — אפשר להמשיך ישר להזמנה." }
          : { shown: true, message: "הכפתורים מוצגים. חכי לאישור שלה (תגיע הודעה 'אישרתי להמשיך כאורחת')." },
    }),
    show_buttons: tool({
      description:
        "מציג ללקוחה כפתורים לחיצים מתחת לתשובה (מעבר לעמוד באתר). השתמשי כשיש צעד הבא ברור. עד 3 כפתורים. href רק מהרשימה: " +
        CHAT_BUTTON_PATHS.join(" "),
      inputSchema: z.object({
        buttons: z
          .array(z.object({ label: z.string().max(30), href: z.string().max(60) }))
          .max(3),
      }),
      execute: async ({ buttons }) => ({ shown: buttons.length }),
    }),

    get_my_account: tool({
      description:
        "האזור האישי של הלקוחה המחוברת: השריונים שלה, הזמנות האביזרים שלה ויתרת הקרדיט/קאשבק. רק כשהיא שואלת על ההזמנות/החשבון שלה.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!opts.userId || !opts.isRealAccount)
          return { loggedIn: false, message: "הלקוחה לא מחוברת — הציעי כפתור התחברות (/auth)." };
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as any;
          const [b, o, l] = await Promise.all([
            db
              .from("bookings")
              .select("session_date, start_time, end_time, status, deposit_status, price")
              .eq("user_id", opts.userId)
              .neq("package", "newborn")
              .order("session_date", { ascending: false })
              .limit(5),
            db
              .from("orders")
              .select("track, session_date, return_date, status, deposit_status, total")
              .eq("user_id", opts.userId)
              .order("created_at", { ascending: false })
              .limit(5),
            db.from("customer_loyalty").select("credit_balance").eq("user_id", opts.userId).maybeSingle(),
          ]);
          return {
            loggedIn: true,
            studioBookings: (b.data ?? []).map((x: any) => ({
              date: x.session_date,
              from: String(x.start_time ?? "").slice(0, 5),
              to: String(x.end_time ?? "").slice(0, 5),
              status: x.status,
              deposit: x.deposit_status,
              price: x.price,
            })),
            propOrders: (o.data ?? []).map((x: any) => ({
              track: x.track,
              from: x.session_date,
              to: x.return_date,
              status: x.status,
              deposit: x.deposit_status,
              total: x.total,
            })),
            creditBalance: Number(l.data?.credit_balance ?? 0),
            note: "קבלות, תשלום מקדמה ופרטים מלאים — בעמוד /account",
          };
        } catch (e) {
          console.error("[SWEETBABY] get_my_account failed", e);
          return { error: true, message: "לא הצלחתי לקרוא את החשבון כרגע — הפני ל-/account." };
        }
      },
    }),

    send_message_to_studio: tool({
      description:
        "שולח הודעה למייל של הסטודיו (למיכל) בשם הלקוחה. רק אחרי שהלקוחה ביקשה ואישרה את נוסח ההודעה, ויש שם + טלפון או אימייל לחזרה.",
      inputSchema: z.object({
        name: z.string().min(2).max(80),
        phone: z.string().max(30).optional(),
        email: z.string().max(120).optional(),
        message: z.string().min(3).max(1500),
      }),
      execute: async ({ name, phone, email, message }) => {
        if (!phone && !email) return { ok: false, message: "חסר טלפון או אימייל לחזרה — בקשי מהלקוחה." };
        const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        try {
          const { sendGmail } = await import("@/integrations/google/gmail.server");
          const ok = await sendGmail({
            to: "s0548529277@gmail.com",
            subject: `הודעה מהצ׳אט באתר — ${name}`,
            html: `<div dir="rtl" style="font-family:sans-serif;color:#2d3d2b">
              <h3 style="margin:0 0 8px">הודעה חדשה מהצ׳אט באתר</h3>
              <p style="margin:2px 0"><b>שם:</b> ${esc(name)}</p>
              ${phone ? `<p style="margin:2px 0"><b>טלפון:</b> ${esc(phone)}</p>` : ""}
              ${email ? `<p style="margin:2px 0"><b>אימייל:</b> ${esc(email)}</p>` : ""}
              <p style="margin:10px 0 0;white-space:pre-wrap">${esc(message)}</p>
            </div>`,
          });
          if (!ok) return { ok: false, message: "השליחה נכשלה — תני את הטלפון 054-8529277 כחלופה." };
          return { ok: true };
        } catch (e) {
          console.error("[SWEETBABY] send_message_to_studio failed", e);
          return { ok: false, message: "השליחה נכשלה — תני את הטלפון 054-8529277 כחלופה." };
        }
      },
    }),
  };
}

export function buildAssistantTools(opts?: { isAuthenticated?: boolean; isGuest?: boolean }) {
  return {
    // One call instead of 3-4 (speed, 2026-11-03): converts a Hebrew date if given, checks the studio on that day
    // (or finds the nearest free days when no date), and prices the session — all in a single tool round-trip.
    studio_check: tool({
      description:
        "כלי אחד לכל שאלת זמינות/מחיר של הסטודיו. עם תאריך (לועזי YYYY-MM-DD, או עברי: hebrewDay+hebrewMonth) — מחזיר חצאי שעה פנויים, האם השעה המבוקשת פנויה והאם יש מספיק רצף, ומחיר אם ידועה משך. בלי תאריך — מחזיר 2-5 מועדים פנויים קרובים. קראי לזה במקום check_studio_availability + find_next_available_days + quote_studio_price + hebrew_date_to_gregorian.",
      inputSchema: z.object({
        date: z.string().optional().describe("YYYY-MM-DD"),
        hebrewDay: z.number().int().min(1).max(30).optional(),
        hebrewMonth: z.string().optional().describe('למשל "כסלו"'),
        hebrewYear: z.number().int().optional(),
        time: z.string().optional().describe("HH:MM שעת התחלה מבוקשת"),
        hours: z.number().optional().describe("משך בשעות, אפשר 1.5 (ברירת מחדל 1)"),
        guidance: z.enum(["basic", "mini", "plus", "premium"]).optional(),
      }),
      execute: async ({ date, hebrewDay, hebrewMonth, hebrewYear, time, hours, guidance }) => {
        try {
          let day = date;
          if (!day && hebrewDay && hebrewMonth) {
            try {
              const { HDate } = await import("@hebcal/hdate");
              const hd = new HDate(hebrewDay, hebrewMonth, hebrewYear ?? new HDate().getFullYear());
              day = hd.greg().toISOString().slice(0, 10);
            } catch (e: any) {
              return { ok: false, message: `לא הצלחתי להמיר את התאריך העברי (${e?.message ?? "שגיאה"}) — בקשי תאריך לועזי.` };
            }
          }
          const duration = hours ?? 1;
          const slots = Math.max(2, Math.round(duration * 2));
          const quote = (start?: string) => {
            const base = computeStudioPrice(slots, start?.slice(0, 5) ?? "");
            const add = GUIDANCE[guidance ?? "basic"];
            return { hours: slots / 2, basePrice: base, guidanceFee: add, total: base + add, deposit: 90 };
          };
          if (!day) {
            const from = israelNow().date;
            const options = await nextAvailableDays(from, duration, 21, 5);
            return { mode: "nearest_free_days", from, hours: duration, options, price: quote() };
          }
          const res = await studioAvailability(day, time);
          if (res.closed) return { mode: "day", date: day, closed: true, message: "הסטודיו סגור ביום זה" };
          let enough: boolean | null = null;
          if (time) {
            const [h, m] = time.slice(0, 5).split(":").map(Number);
            enough = Array.from({ length: slots }, (_, i) => {
              const t = h * 60 + m + i * 30;
              return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
            }).every((x) => res.freeSlots.includes(x));
          }
          return {
            mode: "day",
            date: day,
            closed: false,
            requestedTime: time ?? null,
            requestedTimeFree: time ? res.wantedFree : null,
            enoughConsecutiveTime: enough,
            freeSlots: res.freeSlots,
            calendarLinked: res.calendarLinked ?? true,
            price: quote(time),
          };
        } catch (e) {
          console.error("[SWEETBABY] studio_check failed", e);
          return { error: true, message: "הבדיקה נכשלה זמנית — אל תמציאי זמינות או מחיר; הסבירי שיש תקלה זמנית והציעי לנסות שוב עוד רגע." };
        }
      },
    }),

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
        const matches = await findSkusByText(query, 6);
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
      description: "מחפש אביזרים בקטלוג לפי תיאור בעברית ומחזיר מק״טים, שמות ומחירים (בלי בדיקת זמינות). החיפוש כולל גם את התגיות שמיכל סימנה לכל אביזר (למשל חלאקה, סמאש קייק) — אפשר לחפש לפי סגנון. באתר — הפריטים מוצגים ללקוחה אוטומטית ככרטיסים עם תמונה וכפתור הוספה לעגלה.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const items = await findSkusByText(query, 8);
        return {
          count: items.length,
          items: items.map((i) => ({
            sku: i.sku,
            name: i.name || i.alt,
            price: i.price,
            ...(i.tags.length ? { tags: i.tags } : {}),
          })),
        };
      },
    }),

    quote_studio_price: tool({
      description: "מחשב מחיר מדויק להשכרת הסטודיו לפי משך וזמן התחלה, כולל תוספת הדרכה.",
      inputSchema: z.object({
        hours: z.number().describe("משך בשעות, אפשר 1.5"),
        startTime: z.string().optional().describe("HH:MM"),
        guidance: z.enum(["basic", "mini", "plus", "premium"]).optional(),
      }),
      execute: async ({ hours, startTime, guidance }) => {
        const slots = Math.max(2, Math.round(hours * 2));
        const base = computeStudioPrice(slots, startTime?.slice(0, 5) ?? "");
        const add = GUIDANCE[guidance ?? "basic"];
        return {
          hours: slots / 2,
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

    // There used to be a list_active_coupons tool here that let the bot
    // recite a real coupon code straight in chat/voice to anyone who asked.
    // Removed per explicit request — discount codes are only ever meant to
    // reach a customer as a personal one-time code by email, minted on an
    // actual newsletter signup (see issuePersonalCoupon in
    // newsletter.functions.ts). No general "give the code away in
    // conversation" path should exist at all, even when asked directly —
    // the bot now always points a discount question at the newsletter
    // signup form instead (see the SYSTEM/toolRules prompts).

    create_studio_booking: tool({
      description: `יוצרת שריון סטודיו אמיתי (לא רק בדיקה!) עבור לקוחה מחוברת (חשבון אישי או אורחת שאישרה בצ׳אט להמשיך כאורחת) שמתקשה להשלים את התהליך לבד באתר. זה כלי רציני — לפני שמשתמשים בו חובה:
1. לבדוק זמינות אמיתית עם check_studio_availability ולוודא שהתאריך/שעה באמת פנויים.
2. לקבל מהלקוחה בפירוש: שם מלא, טלפון, ואימייל (חובה — לשם יישלח אישור ההזמנה, בדיוק כמו בהזמנה רגילה).
3. לשאול (בקצרה, אפשר לדלג על מה שלא רלוונטי) את פרטי השאלון: סוג הצילום, כמה אנשים בערך, גיל התינוק/ת אם ניו-בורן, האם יש מצלמה/צריך המלצה, ניסיון עם פלאש, האם צריך אביזרים, בקשות מיוחדות.
4. להציג לה בהודעה בצ'אט (לא רק לינק) את התנאים המרכזיים ולקבל הסכמה מפורשת: מקדמה 90₪ שלא מוחזרת בביטול, ביטול ביום האירוע = 100%, נזק = עלות תיקון/רכישה +20% דמי טיפול, בלגן/ניקיון לא תקין = 150₪.
5. אל לשאול על אופן תשלום ואל לדקלם פרטי בנק — אחרי היצירה מופיע כפתור תשלום מקדמה (את depositPlan מלאי will_pay_now אלא אם אמרה אחרת).
${!opts?.isAuthenticated ? "אין עדיין חיבור (לא חשבון ולא אורחת שאישרה) — אסור לקרוא לכלי הזה; קראי קודם ל-offer_guest_continue וחכי שהלקוחה תאשר בכפתור (להמשיך כאורחת בלי הרשמה, או להתחבר)." : opts?.isGuest ? "הלקוחה ממשיכה כאורחת (בלי הרשמה) באישורה — מותר לקרוא לכלי אחרי שכל התנאים לעיל התקיימו; אימייל חובה." : "הלקוחה מחוברת בחשבון אישי, אפשר להשתמש בכלי אחרי שכל התנאים לעיל התקיימו."}
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
          return { ok: false, message: "אין עדיין חיבור — קראי ל-offer_guest_continue כדי שהלקוחה תאשר בכפתור להמשיך כאורחת (בלי הרשמה) או להתחבר, ואז המשיכי." };
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
            payPath: `/deposit/booking/${res.id}`,
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

    create_props_order: tool({
      description: `יוצרת הזמנת השכרת אביזרים אמיתית (לא רק בדיקה!) עבור לקוחה עם חשבון אישי אמיתי, בלי שתצטרך לעבור בעצמה על העגלה והקופה. חובה לפני הקריאה:
1. לאתר את הפריטים עם search_catalog ולבדוק זמינות אמיתית בתאריכים עם check_prop_availability — רק פריטים פנויים נכנסים להזמנה.
2. לקבל בפירוש: תאריך איסוף (יום הצילום), תאריך החזרה, שם מלא וטלפון.
3. להציג בהודעה בצ'אט סיכום: הפריטים, הכמויות, התאריכים והמחיר הכולל המשוער, ולקבל אישור מפורש ("כן, תזמיני") ואישור לתנאי ההשכרה והמקדמה (מקדמה לא מוחזרת בביטול; התנאים המלאים בעמוד התשלום).
${!opts?.isAuthenticated ? "אין עדיין חיבור (לא חשבון ולא אורחת שאישרה) — אסור לקרוא לכלי הזה; קראי קודם ל-offer_guest_continue וחכי שהלקוחה תאשר בכפתור." : opts?.isGuest ? "הלקוחה ממשיכה כאורחת (בלי הרשמה) באישורה — מותר לקרוא לכלי; אימייל חובה." : ""}
ההזמנה נוצרת במצב 'ממתין' — עדיין דורשת תשלום מקדמה כדי להתאשר, בדיוק כמו הזמנה רגילה; מיד אחרי היצירה הציגי כפתור תשלום.`,
      inputSchema: z.object({
        lines: z
          .array(z.object({ sku: z.string().min(1).describe("מק״ט מתוצאות הכלים"), quantity: z.number().int().min(1).max(10).default(1) }))
          .min(1)
          .max(20),
        pickupDate: z.string().describe("YYYY-MM-DD — יום הצילום / האיסוף"),
        returnDate: z.string().describe("YYYY-MM-DD — יום ההחזרה (אותו יום או מאוחר יותר)"),
        contactName: z.string().min(2).max(120),
        contactPhone: z.string().min(5).max(40),
        contactEmail: z.string().email().max(160).optional().describe("אימייל תקין — חובה לאורחת (לשם יישלח אישור ההזמנה); למחוברת אפשר לדלג"),
        notes: z.string().max(500).optional(),
        termsAccepted: z.boolean().describe("true רק אם הלקוחה אישרה בפירוש בצ'אט את הסיכום, התנאים והמקדמה"),
      }),
      execute: async (args) => {
        if (!opts?.isAuthenticated) {
          return { ok: false, message: "אין עדיין חיבור — קראי ל-offer_guest_continue כדי שהלקוחה תאשר בכפתור להמשיך כאורחת (בלי הרשמה) או להתחבר, ואז המשיכי." };
        }
        if (!args.termsAccepted) {
          return { ok: false, message: "חסר אישור מפורש מהלקוחה לסיכום, לתנאים ולמקדמה — יש לבקש קודם, לא ליצור הזמנה בלעדיו." };
        }
        if (opts?.isGuest && !args.contactEmail) {
          return { ok: false, message: "חסר אימייל — לאורחת חובה אימייל כדי שיישלח אישור ההזמנה. בקשי ממנה אימייל ואז קראי שוב." };
        }
        const today = israelNow().date;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(args.pickupDate) || !/^\d{4}-\d{2}-\d{2}$/.test(args.returnDate) || args.pickupDate < today || args.returnDate < args.pickupDate) {
          return { ok: false, message: "התאריכים לא תקינים (איסוף לא בעבר, והחזרה לא לפני האיסוף) — בקשי תאריכים מתוקנים." };
        }
        try {
          const skus = Array.from(new Set(args.lines.map((l) => l.sku)));
          const avail = await propsAvailability(skus, args.pickupDate, args.returnDate);
          const availBySku = new Map(avail.map((r) => [r.sku, r]));
          const unavailable = args.lines.filter((l) => (availBySku.get(l.sku)?.available ?? 0) < l.quantity);
          if (unavailable.length) {
            return {
              ok: false,
              message: `לא זמינים בתאריכים האלה (או בכמות המבוקשת): ${unavailable.map((l) => availBySku.get(l.sku)?.name ?? l.sku).join(", ")}. הציעי תאריך אחר או חלופה מהקטלוג — לא ליצור הזמנה חלקית בלי אישור הלקוחה.`,
            };
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: rows, error } = await supabaseAdmin.from("items").select("id, name, sku, price").in("sku", skus);
          if (error) throw new Error(error.message);
          const bySku = new Map((rows ?? []).map((r: any) => [r.sku, r]));
          const lines = args.lines.map((l) => {
            const it: any = bySku.get(l.sku);
            if (!it) throw new Error(`פריט לא נמצא: ${l.sku}`);
            return { id: it.id, name: it.name, sku: it.sku, price: Number(it.price), quantity: l.quantity };
          });
          const { placeOrder } = await import("./orders.functions");
          const res = await placeOrder({
            data: {
              lines,
              session_date: args.pickupDate,
              return_date: args.returnDate,
              contact_name: args.contactName,
              contact_phone: args.contactPhone,
              contact_email: args.contactEmail || null,
              notes: [args.notes, opts?.isGuest ? "הזמנה שבוצעה דרך הצ'אט באתר — במצב אורחת (בלי הרשמה)" : "הזמנה שבוצעה דרך הצ'אט באתר"].filter(Boolean).join("\n"),
              terms_accepted: true,
            },
          });
          return {
            ok: true,
            orderId: res.id,
            total: res.total,
            deposit: res.deposit,
            payPath: `/deposit/order/${res.id}`,
            message:
              "ההזמנה נוצרה במצב ממתין לתשלום מקדמה. כפתור 'לתשלום המקדמה' מוצג ללקוחה אוטומטית — הסבירי בקצרה שההזמנה תאושר סופית רק אחרי התשלום (הפריטים שמורים לה לזמן קצר), ושנשלח אליה מייל סיכום.",
          };
        } catch (e: any) {
          return {
            ok: false,
            message: `יצירת ההזמנה נכשלה: ${e?.message ?? "שגיאה לא צפויה"}. אפשר להציע ללקוחה להוסיף לעגלה ולהשלים ב-/cart, או לשלוח הודעה לסטודיו.`,
          };
        }
      },
    }),
  };
}

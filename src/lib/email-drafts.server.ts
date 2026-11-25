/**
 * Automatic reply-draft assistant (owner request 2026-10-27: "תלמד אותו לענות
 * מעוצב כמוך ויותר יפה ומחק את שלך"). Replaces the Claude scheduled task
 * "טיוטות תשובה לכל פנייה": runs from the existing cron route
 * (/api/send-booking-reminders), reads the owner's Gmail (personal
 * m0548529277 if linked, else the studio account), and for every new email
 * that waits for her answer creates a DESIGNED Gmail draft — it never sends.
 * Also: one gentle follow-up draft for clients who went quiet 3–10 days
 * after her answer, leads into inquiry_leads, and a short summary email to
 * her when drafts were created.
 *
 * Exception (owner request 2026-11-02): URGENT emails from clients about a
 * studio booking or prop rental get a short first-response that IS sent
 * automatically (clearly labelled as an automatic first reply by the
 * SweetBot, with an apology in advance), and a normal draft is still left
 * for her to review and answer personally. See shouldAutoSend().
 * SWITCHED OFF 2026-11-19 (owner: the automatic replies contained mistakes):
 * AUTO_FIRST_REPLY_ENABLED = false, so the assistant only prepares drafts.
 *
 * Cheap by design: a Gmail search every run, AI only for real new threads
 * (per-run caps in DraftRunLimits: small on the old hourly route, none on the dedicated 10-minute route), runs every 10 minutes
 * between 7:30 and 23:50 Israel time (owner request 2026-11-04), never on Shabbat. Threads already looked at are
 * remembered in app_settings (email_drafts_seen) so nothing is re-judged.
 */
import { emailThumbUrl } from "./media-url";
import { readEmailDesign } from "./email-design.server";
import { generateTextResilient } from "./ai-gateway.server";
import { buildDraftHtml, buildDraftText, type DraftBrand, type PriceList } from "./email-draft-design";
import { chatLinkUrl } from "./orderSummary";
import { parseFamilyRoomReply, hourlySlots } from "./family-room-reply";
import { SITE_INQUIRY_QUERY, SITE_INQUIRY_SUBJECT, customerEmailInNotice } from "./site-inquiry";
import { LEAD_SUBJECT_HEADER, LEAD_THREAD_QUERY, effectiveSubject } from "./lead-thread";
import { isOwnStudioAddress } from "./studio-addresses";
import { isBlankTemplateDraft } from "./draft-template";

/**
 * How much one run may do. LEGACY = what the old hourly route (/api/send-booking-reminders, called from outside every 15 min)
 * can safely afford. DEDICATED = the 10-minute run started by the database itself (pg_cron + pg_net -> /api/run-email-drafts,
 * 19.11, owner: "every 10 minutes, prepare everything at once, no limit"): no per-run cap on drafts, only a time budget,
 * and pg_net waits for the answer as long as the run needs (timeout set in the cron command).
 *  - maxNew: drafts per run (Infinity = until the waiting list is empty or the time budget ends)
 *  - runBudgetMs: after this much of the run no NEW thread is sent to the AI (at least one per run always is)
 *  - hardBudgetMs: hard stop for every loop over waiting threads (cheap skips included) and for the follow-up pass
 *  - concurrency: how many waiting threads are analysed at the same time (the AI call is ~25 s per thread, so 3 at once
 *    triples the throughput; the old route keeps 1)
 *  - maxFollowups: follow-up drafts for clients who went quiet
 * 19.11 history: the 10 s budget left room for ONE thread per run, 14 s for about three; runs of 40 s and more were cut off
 * by the external caller (it does not wait), which is why the long budget only applies to the dedicated route.
 */
export type DraftRunLimits = { maxNew: number; runBudgetMs: number; hardBudgetMs: number; maxFollowups: number; concurrency: number };
export const LEGACY_DRAFT_LIMITS: DraftRunLimits = { maxNew: 3, runBudgetMs: 14_000, hardBudgetMs: 20_000, maxFollowups: 2, concurrency: 1 };
export const DEDICATED_DRAFT_LIMITS: DraftRunLimits = { maxNew: Number.POSITIVE_INFINITY, runBudgetMs: 60_000, hardBudgetMs: 75_000, maxFollowups: 10, concurrency: 3 };
// Owner request 2026-11-04: a run every 10 minutes. The gap is 9 min so that a scheduler firing every 10 minutes sharp
// (with a few seconds of jitter) never gets skipped as "too_soon". The 10-minute cron of the database is the main caller; the
// old external route only takes over (minGapMs 12 min, see below) when the cron has been silent for longer than that, so the
// two never run at the same time.
const MIN_GAP_MS = 9 * 60_000;
// Owner request 19.11: every 5 minutes between 08:00 and 15:00 Israel time (the cron fires every 5 minutes around the clock;
// outside this window the 9-minute gap above turns every second firing into a cheap "too_soon").
const PEAK_START_MIN = 8 * 60;
const PEAK_END_MIN = 15 * 60;
const PEAK_GAP_MS = 4 * 60_000;
// Active window (Israel time), in minutes from midnight: 07:30 – 23:50.
const WINDOW_START_MIN = 7 * 60 + 30;
const WINDOW_END_MIN = 23 * 60 + 50;
const SEEN_KEY = "email_drafts_seen";
const STATUS_KEY = "email_drafts_status";
const LAST_RUN_KEY = "email_drafts_last_run";
/** Studio photos (public/email) shown with the newborn price cards next to the sample newborn photo. */
/** Newborn price-list photos (cut from the owner's price-list image, already arched): mini, pampered, luxury. */
const NEWBORN_CARD_PHOTOS = ["mini", "pamper", "luxury"].map((n) => `https://sweetbabyphoto.shop/email/newborn-card-${n}.jpg`);
/** Outdoor price-list photos (cut from the owner's outdoor price-list image, already arched): dream, popular, magic. */
const OUTDOOR_CARD_PHOTOS = ["dream", "popular", "magic"].map((n) => `https://sweetbabyphoto.shop/email/outdoor-card-${n}.jpg`);
const PHOTOS_KEY = "email_drafts_sample_photos";
const OWNER_ADDRESSES = ["m0548529277@gmail.com"];
const OWNER_NOTIFY = "m0548529277@gmail.com";
const LABEL_READY = "טיוטה מוכנה ✍️";
const LABEL_SENT = "נשלח ✓";
const LABEL_FOLLOW = "מעקב נשלח 🔁";
const LABEL_AUTO = "מענה ראשוני אוטומטי 🤖";
/**
 * Master switch for the automatic first reply. false = NOTHING is sent
 * automatically; every inquiry only gets a draft for the owner (owner request
 * 2026-11-19, after the 19.11 automatic replies misread a time, promised
 * availability that was not checked, and answered a price negotiation as a
 * studio inquiry). Set to true only after the owner asks for it again.
 */
const AUTO_FIRST_REPLY_ENABLED = false;
const AUTO_MAX_PER_RUN = 3;
const AUTO_MAX_PER_DAY = 15;
const PHOTO_TOPICS = ["newborn", "birth_basket", "upsherin", "family", "outdoor"];
const AUTO_DAY_KEY = "email_auto_replies_day";
export const AUTO_REPLY_NOTE = "🤖 נשלח מענה ראשוני אוטומטי — ממתין למענה אנושי ממיכל";
/** Shown as a highlighted box at the top of every automatic first reply. */
const AUTO_DISCLAIMER = [
  "> **🤖 זהו מענה ראשוני אוטומטי של סוויטבוט — העוזר הדיגיטלי של מיכל.**",
  "> מיכל תעבור על הפנייה ותבדוק שעניתי נכון, ואם יהיה צורך היא תחזור אלייך אישית.",
  "> סליחה מראש אם נפלה טעות במענה האוטומטי — אני עלול לטעות 💗",
  "> עד אז אפשר להמשיך לשוחח איתי ולבצע פעולות באתר (לבדוק זמינות, לשריין, להזמין) בכפתור למטה.",
].join("\n");
const AUTO_CHAT_CTA = { label: "להמשיך בצ׳אט עם סוויטבוט 💬", url: chatLinkUrl("help") };
const SITE_FORM_SENDER = "sitemailerservice.com";
export const DRAFT_READY_NOTE = "✍️ הוכנה טיוטה (לא נשלחה)";
export const FOLLOWUP_DRAFT_NOTE = "🔁 הוכנה טיוטת מעקב (לא נשלחה)";

const CTA_URLS: Record<string, string> = {
  gallery: "https://michalsiboni.co.il",
  photography: "https://sweetbabyphoto.shop/studio-photography",
  studio: "https://sweetbabyphoto.shop/studio-rental",
  booking: "https://sweetbabyphoto.shop/booking",
  props: "https://sweetbabyphoto.shop/rental-catalog",
  collage: "https://sweetbabyphoto.shop/collage-maker",
};

const KNOWLEDGE = `
=== מיכל — צלמת (המותג PHOTOGRAPHER) ===
- צילומי ניו בורן, משפחה, חלאקה, גיל שנה וילדים — בסטודיו (תלמוד ירושלמי 24, בית שמש) או בחוץ.
- גיל מומלץ לניו בורן: עד שבועיים (בנים לפני הברית, בנות עד שבועיים) — סטים מסודרים בעיניים עצומות. אפשר עד חודש, אבל אז אין התחייבות לסטים בעיניים עצומות — לעודד להגיע עד שבועיים. תינוק גדול יותר — אפשר לנצל את הזיכוי לצילום אחר (משפחה, חלאקה).
- מחירונים: אל תכתבי מחירים בטקסט — אם שואלים על מחירים/חבילות, בחרי priceList והמחירון המעוצב יתווסף אוטומטית (newborn לניו בורן; outdoor לכל השאר; both אם לא ברור). דוגמה: זיכוי סל לידה של כ-1,200₪ מכסה את החבילה המפנקת.
- סל לידה: קופות מכבי, כללית, לאומית בלבד מחזירות על ייעוץ שינה לתינוק מסל הלידה. מאוחדת לא מחזירה על ייעוץ שינה מהסל — למבוטחת מאוחדת שמתעניינת בסל, להציע במקום זאת הנחה של 10% על החבילות הרגילות. מיכל עובדת עם יועצת השינה שולמית בן נאים (052-712-6888). הלקוחה מממשת את הסל על ייעוץ שינה אצל שולמית, ובמתנה מקבלת זיכוי של חצי מהסכום שמומש לצילום אצל מיכל. אל תכתבי ללקוחה סכום זיכוי מדויק (יש אי-התאמה בין תשובות קודמות של מיכל, 1,175₪ מול 1,200₪) — רק שרוב הסלים המלאים מכסים את החבילה המפנקת (1,300₪) כמעט במלואה או במלואה, ושאת המספרים המדויקים לקופה שלה שולמית תיתן לה בשיחה קצרה. חשבון פנימי להבנה (לא לציטוט ללקוחה): סל מלא ≈2,350₪; קבלות על כ-3,150₪; הקופה מחזירה כ-2,350₪; הפרש כ-800₪ מוחזר בהעברה בנקאית → העלות מכוסה. אפשר סל חלקי אם נשארו לפחות 1,000₪; הזיכוי תמיד חצי ממה שמומש; אם הזיכוי לא מכסה את החבילה — היא משלימה את ההפרש. הקבלה היא על ייעוץ השינה. הזכאות תלויה בקופה ובביטוח → להמליץ לבדוק מול הקופה; מיכל יכולה לבקש משולמית להתקשר. חבילת ניו בורן של סל לידה: 4 סטים, 12 תמונות ערוכות, קולאז׳ מעוצב למייל, אלבום מודפס ומעוצב 20/40, 'אונקי' עם כל התמונות; אפשר גם כצילום משפחה, ומי שבוחרת ניו בורן מקבלת גם סט משפחתי אחד. ייעוץ השינה: בבית, כשעתיים וחצי. הצעד הבא ללקוחה: למלא טופס פרטים קצר → להתקשר לשולמית לתיאום הקורס → מיד אחר כך למיכל לקביעת מועד צילומים; לבקש ממנה לעדכן כשדיברה עם שולמית. שאלה הלכתית על המימוש — אל תנסחי תשובה הלכתית בעצמך: השאירי בטקסט placeholder בדיוק כך: '[[מיכל: שאלה הלכתית על מימוש הסל — להשלים תשובה]]' והוסיפי flag.
- גלריה: michalsiboni.co.il · עמוד הצילומים באתר הסטודיו: sweetbabyphoto.shop/studio-photography.

=== סטודיו Sweetbaby (המותג STUDIO) — לצלמות ששוכרות ===
- כתובת: תלמוד ירושלמי 24, בית שמש. שעות: א׳–ה׳ 8:00–23:00; ו׳/ערב חג עד שעתיים לפני שבת; מוצ״ש משעה אחרי צאת שבת. איסוף/החזרת אביזרים עד 22:00 בלבד.
- מחיר: שעה ראשונה 180₪, כל שעה נוספת 100₪, חצאי שעה יחסי. מבצע ניו בורן: 3 שעות רצופות ב-320₪ בחלון 11:00–20:00 (כל שעת התחלה בין 11:00 ל-17:00); מחיר קבוע וסופי — לא משתלב עם קופון, כרטיסייה, הנחה, קרדיט או קאשבק, ולא צוברים עליו קאשבק; מחוץ לחלון — התמחור השעתי הרגיל. מצלמת Canon 5D Mark III כלולה בהשכרה.
- אביזרים בהשכרת סטודיו: כל מה שבסטודיו לשימוש חופשי; לפחות 90% מהקטלוג בסטודיו בכל רגע; שריון אביזר מסוים — אופציונלי בשלב ההזמנה. לא להבטיח מספר אביזרים.
- מועדון קאשבק: 10% קרדיט על כל הזמנה (מינימום ההזמנה עצמו 100₪). הנחות רק דרך הרשמה לניוזלטר — לעולם לא לתת קוד.
- הזמנה: הסכם תיאום ציפיות ב-sweetbabyphoto.shop/studio-rental → בחירת מועד ב-/booking → מקדמה 90₪ (לא מוחזרת). ביום — תשלום מלא מראש. ביטול ביום עצמו — 100%.
- שלבי ההזמנה באתר (עם חיווי התקדמות): סטודיו — 3 שלבים: שאלון והסכם → בחירת מועד → סיכום ותשלום מקדמה (סיכום ותשלום באותו עמוד); אביזרים — 2 שלבים: עגלה (כולל בחירת תאריכים ובדיקת זמינות, ולמחוברת גם שם וטלפון ישירות בעגלה) → סיכום ותשלום (קופון/קרדיט/הערות אפשר בדף ההזמנה המלא /checkout). לקוחה שמילאה שאלון בשלושת החודשים האחרונים יכולה לדלג עליו. בחיווי ההתקדמות אפשר ללחוץ על שלב שהושלם כדי לחזור (בעריכת הזמנה). אשף ההזמנה בצ׳אט עובד בסדר משלו (מועד → שאלון → פרטים → תשלום) ומוביל לאותו דף תשלום. מייל "בקשת שריון/הזמנה" נשלח ברגע שהבקשה נוצרת (המקום עדיין לא שמור), ומייל "אישור הזמנה" עם קבלה — רק אחרי תשלום המקדמה. מינימום הזמנת אביזרים 100 ₪. "שליחת הסל במייל" לא שומרת את הפריטים ולא משריינת.
- איחור: 15 דק׳ = חצי שעה נוספת, 45 דק׳ = שעה. נזק: תיקון/החלפה +20%. בלגן: 150₪ ניקיון.
- פרטי תשלום (רק אם שאלו איך משלמים): בנק הפועלים (12) סניף 533 חשבון 648912 על שם מיכל סיבוני · ביט 055-984-0237 · פייבוקס 055-317-3954.
- הדרכה: בסיסי חינם · MINI 50₪ · PLUS 100₪ (אין אפשרות הדרכה עם מיכל בסטודיו — מי שמבקשת צילום עם מיכל מופנית לטופס ב-sweetbabyphoto.shop/studio-photography). כרטיסיית SWEET 10+1 — בתיאום ישיר.
- השכרת אביזרים: 400+ אביזרים ב-sweetbabyphoto.shop/rental-catalog, מינימום 100₪, לפי 24 שעות (48 = כפול).
- יוצר קולאז׳ים חינם: sweetbabyphoto.shop/collage-maker. קשר לסטודיו: 054-8529277.`;

export const WRITER_RULES = `את כותבת טיוטות תשובה למיילים בשם מיכל סיבוני. עברית חמה, אישית, בלשון נקבה (אלא אם הפונה גבר בבירור).
טון: תמיד נחמד, סבלני ומכבד — גם עם ספקים וגם כשהפונה לא סבלנית/מתלוננת: להכיר ברגש, להודות, להתנצל כשמתאים, לא להתווכח, לא להישמע קרה או מתגוננת. משפטים קצרים.
מבנה: פתיחה חמה קצרה עם השם הפרטי → תשובה ישירה לשאלה שלה → רק מידע נוסף רלוונטי (לא להעמיס) → צעד הבא אחד ברור.
קודם להבין את ההקשר: מי כותבת ולמה — לקוחה ששואלת על צילומים/סטודיו/אביזרים, או משהו אחר: מיכל מוכרת/קונה פריט (יד 2), צלמת עמיתה, ספק, שותפה (שולמית), עניין אישי. מידע על השירותים, מחירונים וכפתורים — רק ללקוחה ששאלה עליהם. לעולם לא להציע שירות שלא שאלו עליו, ולא "למכור" למי שאמרה שזה לא רלוונטי.
אם צלמת עמיתה שואלת על ההסדר/שיתוף הפעולה העסקי של מיכל (למשל עם שולמית, תמחור פנימי, אחוזים) — אל תנסחי את התשובה בעצמך: body = '[[מיכל: קולגה שואלת על ההסדר שלך — להחליט כמה לשתף ולהשיב בעצמך]]', isClient=false, needsReply=true, והוסיפי flag מתאים.
סגנון של מיכל: עברית פשוטה ויומיומית, ישירה וחמה, כמו הודעה ממנה ולא כמו פרסומת. בלי קלישאות שיווקיות ("חשוב לי מאוד ש...", "מרחב נעים", "חוויה בלתי נשכחת"), בלי הסברים מיותרים ובלי לחזור על עצמך.
עובדות: רק מהידע למטה או מתשובות קודמות של מיכל (כשיש סתירה — התשובה האחרונה של מיכל קובעת). אסור להמציא מחירים, תאריכים, זמינות או הבטחות. משהו לא ידוע → "אבדוק ואחזור אלייך בהקדם" + flag למיכל. זמינות — "אבדוק ואאשר". דבר שדורש החלטה של מיכל → [[מיכל: ...]] בטקסט + flag. לעולם לא קוד קופון. לעולם לא להעתיק פרטים של לקוחה אחת לאחרת.
עיצוב הטקסט (body): פסקאות מופרדות בשורה ריקה; רשימה = שורות שמתחילות ב-"- "; כותרת קטנה = "## כותרת"; תיבה מודגשת = שורות שמתחילות ב-"> "; **מודגש**. בלי HTML, בלי חתימה (נוספת אוטומטית), בלי קישורי תמונות. אימוג׳י רק 💗 או ✨ ובמשורה.
איכות: לענות על כל שאלה שנשאלה בשרשור (לא רק האחרונה), לשקף פרט אחד ספציפי שהלקוחה כתבה כדי שירגיש אישי, לא לחזור על מה שמיכל כבר כתבה בשרשור, לסיים בשאלה/הזמנה אחת קונקרטית (למשל "איזה תאריך נוח לך?"). אורך לפי ההודעה שקיבלנו: הודעה קצרה או שאלה אחת → 1–3 משפטים קצרים. פנייה ראשונה של לקוחה עם כמה שאלות → עד 120 מילים. רק כשהשאלה באמת מורכבת — יותר. נושא (subject) קצר וברור בעברית, "Re:" רק בתשובה לשרשור קיים.
כשלקוחה חדשה שואלת על צילומי ניו בורן רגילים (לא סל לידה) בלי לפרט — לשאול בתשובה כמה סטים היא רוצה והאם עם אלבום או בלי, ואם אפשר להבין מההודעה מה יתאים לה — להמליץ חבילה אחת במשפט קצר.
פעולות: את רק כותבת טיוטה — לא ביצעת שום פעולה. אסור לכתוב שעדכנת/שינית/שריינת/ביטלת/שלחת/אישרת משהו ביומן, בהזמנה או בתשלום, ואסור להבטיח שכבר נעשה. מותר רק "אבדוק ואעדכן", "אחזור אלייך עם אישור", או placeholder '[[מיכל: לבצע ולאשר …]]' + flag כשהבקשה דורשת פעולה ממנה. לא להוסיף פרטים (שעה, מחיר, תאריך, כתובת) שלא מופיעים במפורש בשרשור או בידע.
${KNOWLEDGE}`;

type Seen = { ids: string[] };

type Analysis = {
  needsReply: boolean;
  brand: DraftBrand;
  topic: string;
  isClient: boolean;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  question?: string;
  priceList: PriceList;
  photos: "newborn" | "family" | "none";
  bigPhotos?: boolean;
  cta?: string | null;
  subject?: string;
  body: string;
  summary: string;
  flags?: string[];
  /** Client, studio/props topic, time-sensitive — eligible for the automatic first reply. */
  urgent?: boolean;
  /** Studio/props inquirer who doesn't realise she can book/order by herself on the site or through the bot. */
  needsGuidance?: boolean;
  /** New client asking about Michal's own photography (brand photographer) — eligible for a respectful automatic first reply with the gallery/site, never prices. */
  photoLead?: boolean;
  /** Short, fact-safe first reply used only when the automatic reply is sent. */
  autoBody?: string;
};

function israelParts(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

function addrOf(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}
function nameOf(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*</);
  return m ? m[1].trim() : "";
}
const isOwner = (addr: string) => OWNER_ADDRESSES.some((o) => addr === o || addr.startsWith(o.split("@")[0] + "+"));

function parseJson<T>(text: string): T | null {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

async function getSetting(db: any, key: string): Promise<string | null> {
  const { data } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setSetting(db: any, key: string, value: string) {
  await db.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
}

async function ensureLabels(g: typeof import("@/integrations/google/gmail.server"), connKey: string) {
  const list = await g.gmailApi<{ labels?: Array<{ id: string; name: string }> }>(connKey, "/users/me/labels");
  const byName = new Map((list?.labels ?? []).map((l) => [l.name, l.id]));
  for (const name of [LABEL_READY, LABEL_SENT, LABEL_FOLLOW, LABEL_AUTO]) {
    if (byName.has(name)) continue;
    const made = await g.gmailApi<{ id: string }>(connKey, "/users/me/labels", {
      method: "POST",
      body: { name, labelListVisibility: "labelShow", messageListVisibility: "show" },
    });
    if (made?.id) byName.set(name, made.id);
  }
  return byName;
}

type DraftRef = { id: string; message?: { id?: string; threadId?: string } };

/** Every draft in the mailbox (paged — the mailbox can hold 200+). null = Gmail call failed. */
async function listAllDrafts(g: typeof import("@/integrations/google/gmail.server"), connKey: string): Promise<DraftRef[] | null> {
  const out: DraftRef[] = [];
  let pageToken = "";
  for (let i = 0; i < 6; i++) {
    const r = await g.gmailApi<{ drafts?: DraftRef[]; nextPageToken?: string }>(
      connKey,
      `/users/me/drafts?maxResults=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
    );
    if (!r) return i === 0 ? null : out;
    out.push(...(r.drafts ?? []));
    if (!r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }
  return out;
}

/**
 * Owner request 2026-10-30: once she has answered a thread marked
 * "טיוטה מוכנה ✍️", the leftover prepared draft is deleted and the label is
 * removed (swapped to "נשלח ✓" when her reply is the newest message).
 * Covers drafts made by this assistant AND by Claude chat (both label the
 * thread). Only drafts OLDER than her latest sent message are deleted — a
 * newer draft (a follow-up, or one she started after sending) is kept, and
 * then the label stays too.
 */
async function cleanupAnsweredThreads(
  g: typeof import("@/integrations/google/gmail.server"),
  connKey: string,
  readyId: string,
  sentLabelId: string | undefined,
  drafts: DraftRef[],
): Promise<{ threads: number; deletedDraftIds: Set<string> }> {
  const deletedDraftIds = new Set<string>();
  let threads = 0;
  const draftByMsg = new Map(drafts.filter((d) => d.message?.id).map((d) => [d.message!.id!, d.id]));
  const list = await g.gmailApi<{ threads?: Array<{ id: string }> }>(
    connKey,
    `/users/me/threads?labelIds=${encodeURIComponent(readyId)}&maxResults=50`,
  );
  for (const t of list?.threads ?? []) {
    const th = await g.gmailApi<{ messages?: Array<{ id: string; labelIds?: string[]; internalDate?: string }> }>(
      connKey,
      `/users/me/threads/${t.id}?format=minimal`,
    );
    const msgs = th?.messages ?? [];
    if (!msgs.length) continue;
    const isDraft = (m: (typeof msgs)[number]) => !!m.labelIds?.includes("DRAFT");
    const at = (m: (typeof msgs)[number]) => Number(m.internalDate || 0);
    const real = msgs.filter((m) => !isDraft(m));
    const lastSent = Math.max(0, ...real.filter((m) => m.labelIds?.includes("SENT")).map(at));
    if (!lastSent) continue; // she hasn't answered in this thread yet
    const lastIncoming = Math.max(0, ...real.filter((m) => !m.labelIds?.includes("SENT")).map(at));

    const threadDrafts = msgs.filter(isDraft);
    let failed = false;
    let removed = 0;
    for (const m of threadDrafts.filter((d) => at(d) < lastSent)) {
      const draftId = draftByMsg.get(m.id);
      if (!draftId) {
        failed = true;
        continue;
      }
      const r = await g.gmailApi(connKey, `/users/me/drafts/${draftId}`, { method: "DELETE" });
      if (r === null) {
        failed = true;
        continue;
      }
      deletedDraftIds.add(draftId);
      removed++;
    }
    if (failed || threadDrafts.length - removed > 0) continue; // a newer draft is still open → keep the label
    const answered = lastSent >= lastIncoming;
    await g.gmailApi(connKey, `/users/me/threads/${t.id}/modify`, {
      method: "POST",
      body: { removeLabelIds: [readyId], ...(answered && sentLabelId ? { addLabelIds: [sentLabelId] } : {}) },
    });
    threads++;
  }
  return { threads, deletedDraftIds };
}

/**
 * Owner 2026-11-15 / 2026-11-20: a thread showed TWO boxes — the written draft and a second "template" draft that holds
 * only the designed card (+ the quoted mail). Gmail makes that second draft when a reply is opened from another screen
 * or device while a draft already exists. The cleanup now covers EVERY thread that has 2+ drafts (not only threads
 * labelled "טיוטה מוכנה", and also drafts that carry the quoted mail): a draft with nothing of its own is deleted when
 * another draft in the thread has text. A draft with any text is never touched, and a blank one younger than 10 minutes
 * is left alone (she may be opening it right now).
 */
const BLANK_DRAFT_MIN_AGE_MS = 10 * 60 * 1000;
const BLANK_SCAN_MAX_THREADS = 40;

async function removeEmptyTemplateDrafts(
  g: typeof import("@/integrations/google/gmail.server"),
  connKey: string,
  _readyId: string,
  drafts: DraftRef[],
): Promise<Set<string>> {
  const removed = new Set<string>();
  const draftByMsg = new Map(drafts.filter((d) => d.message?.id).map((d) => [d.message!.id!, d.id]));
  const perThread = new Map<string, number>();
  for (const d of drafts) {
    const tid = d.message?.threadId;
    if (tid) perThread.set(tid, (perThread.get(tid) ?? 0) + 1);
  }
  const threadIds = [...perThread.entries()].filter(([, n]) => n >= 2).map(([id]) => id).slice(0, BLANK_SCAN_MAX_THREADS);
  for (const tid of threadIds) {
    const th = await g.gmailApi<{ messages?: Array<{ id: string; labelIds?: string[]; snippet?: string; internalDate?: string }> }>(
      connKey,
      `/users/me/threads/${tid}?format=minimal`,
    );
    const ds = (th?.messages ?? []).filter((m) => m.labelIds?.includes("DRAFT"));
    if (ds.length < 2) continue;
    const empty = ds.filter((m) => isBlankTemplateDraft(m.snippet ?? ""));
    if (empty.length === 0 || empty.length === ds.length) continue; // keep at least one written draft
    for (const m of empty) {
      const id = draftByMsg.get(m.id);
      if (!id) continue;
      const ageMs = Date.now() - Number(m.internalDate ?? 0);
      if (!Number.isFinite(ageMs) || ageMs < BLANK_DRAFT_MIN_AGE_MS) continue;
      if ((await g.gmailApi(connKey, `/users/me/drafts/${id}`, { method: "DELETE" })) !== null) removed.add(id);
    }
  }
  return removed;
}

async function upsertLead(db: any, p: Record<string, unknown>) {
  try {
    let existing: any = null;
    if (p.gmail_thread_id) {
      const { data } = await db.from("inquiry_leads").select("*").eq("gmail_thread_id", p.gmail_thread_id).maybeSingle();
      existing = data;
    }
    if (!existing && p.email) {
      const { data } = await db
        .from("inquiry_leads")
        .select("*")
        .ilike("email", String(p.email))
        .order("created_at", { ascending: false })
        .limit(1);
      existing = data?.[0] ?? null;
    }
    const now = new Date().toISOString();
    if (existing) {
      const patch: Record<string, unknown> = { updated_at: now, last_contact_at: p.last_contact_at ?? existing.last_contact_at };
      for (const k of ["name", "phone", "email", "topic", "message", "gmail_thread_id"]) if (!existing[k] && p[k]) patch[k] = p[k];
      if (p.status && !["booked", "not_relevant"].includes(existing.status)) patch.status = p.status;
      if (p.notes) patch.notes = [existing.notes, p.notes].filter(Boolean).join("\n");
      await db.from("inquiry_leads").update(patch).eq("id", existing.id);
    } else {
      await db.from("inquiry_leads").insert({
        status: "new",
        source: "email",
        first_contact_at: now,
        last_contact_at: now,
        ...p,
      });
    }
  } catch (e) {
    console.error("[SWEETBABY] email-drafts lead upsert failed", e);
  }
}

async function findLead(db: any, threadId: string, email: string): Promise<any | null> {
  try {
    const { data: byThread } = await db.from("inquiry_leads").select("*").eq("gmail_thread_id", threadId).maybeSingle();
    if (byThread) return byThread;
    if (!email) return null;
    const { data } = await db
      .from("inquiry_leads")
      .select("*")
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(1);
    return data?.[0] ?? null;
  } catch (e) {
    console.error("[SWEETBABY] email-drafts lead lookup failed", e);
    return null;
  }
}

/** Follow-up draft prepared → lead shows "נשלח מעקב" in /admin/leads. */
async function markFollowUpDraft(db: any, lead: any | null, threadId: string, email: string) {
  if (!lead) return;
  try {
    const now = new Date();
    const note = `${FOLLOWUP_DRAFT_NOTE} ${now.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}`;
    await db
      .from("inquiry_leads")
      .update({
        status: "follow_up",
        follow_up_sent_at: now.toISOString(),
        updated_at: now.toISOString(),
        gmail_thread_id: lead.gmail_thread_id || threadId,
        email: lead.email || email,
        notes: [lead.notes, note].filter(Boolean).join("\n"),
      })
      .eq("id", lead.id);
  } catch (e) {
    console.error("[SWEETBABY] email-drafts follow-up lead update failed", e);
  }
}

/** Short excerpts of Michal's own earlier answers on a similar topic. */
async function pastAnswers(g: typeof import("@/integrations/google/gmail.server"), connKey: string, text: string): Promise<string> {
  const topics: Array<[RegExp, string]> = [
    [/סל לידה|סל הלידה|קופ[הת] חולים|ייעוץ שינה/, '"סל לידה"'],
    [/ניו ?בורן|תינוק|נולד|לידה/, '"ניו בורן"'],
    [/חלאק|תספורת/, "חלאקה"],
    [/משפח|חוץ|גיל שנה|סמאש/, "משפחה"],
    [/השכר|סטודיו|שעה|שריון/, "סטודיו"],
    [/אביזר|קטלוג|מק"?ט/, "אביזרים"],
    [/מחיר|עלות|כמה עולה|חבילה/, "מחיר"],
  ];
  const hit = topics.find(([re]) => re.test(text));
  if (!hit) return "";
  const res = await g.searchGmail(`in:sent ${hit[1]} -from:m0548529277+canned.response@gmail.com`, 2, connKey);
  const out: string[] = [];
  for (const r of res) {
    const body = await g.getGmailMessageBody(r.id, connKey);
    if (body) out.push(`--- תשובה קודמת של מיכל (${r.date}) ---\n${body.split(/\n>|\nOn .+wrote:|בתאריך .+כתב/)[0].slice(0, 1000)}`);
  }
  return out.join("\n\n");
}

function threadText(g: typeof import("@/integrations/google/gmail.server"), messages: any[]): string {
  return messages
    .slice(-3)
    .map((m) => {
      const h = m.payload?.headers;
      const from = g.gmailHeaderValue(h, "From");
      const date = g.gmailHeaderValue(h, "Date");
      const body = (g.extractGmailPlainText(m.payload) || m.snippet || "")
        .split(/\n>|\nOn .+wrote:|בתאריך .+כתב/)[0]
        .slice(0, 2500);
      return `מאת: ${from}\nתאריך: ${date}\n${body}`;
    })
    .join("\n\n=====\n\n");
}

async function loadAutoDay(db: any): Promise<{ date: string; count: number }> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  try {
    const v = JSON.parse((await getSetting(db, AUTO_DAY_KEY)) || "{}");
    if (v?.date === today && Number.isFinite(v.count)) return { date: today, count: v.count };
  } catch {
    /* start a fresh day */
  }
  return { date: today, count: 0 };
}

/**
 * Automatic first reply — only for a real client, studio/props topic, urgent,
 * studio brand, nobody (Michal included) has answered the thread yet, no
 * earlier automatic reply, a valid external address, and within the per-run
 * and per-day caps. Everything else stays a draft for her to send.
 */
function shouldAutoSend(p: {
  a: Analysis;
  brand: DraftBrand;
  toAddr: string;
  answeredBefore: boolean;
  alreadyAuto: boolean;
  runCount: number;
  dayCount: number;
}): boolean {
  if (!AUTO_FIRST_REPLY_ENABLED) return false;
  const { a } = p;
  const rentalPath =
    (a.urgent === true || a.needsGuidance === true) && (a.topic === "studio" || a.topic === "props") && p.brand === "studio";
  const photoPath = a.photoLead === true && p.brand === "photographer" && PHOTO_TOPICS.includes(a.topic);
  return (
    (rentalPath || photoPath) &&
    a.isClient === true &&
    !!a.autoBody?.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.toAddr) &&
    !isOwner(p.toAddr) &&
    !/no-?reply|mailer-daemon|notification|newsletter|bounce/i.test(p.toAddr) &&
    !p.answeredBefore &&
    !p.alreadyAuto &&
    p.runCount < AUTO_MAX_PER_RUN &&
    p.dayCount < AUTO_MAX_PER_DAY
  );
}

/** Creates the labelled reply as a draft and sends it right away. true = sent. */
async function sendAutoReply(
  g: typeof import("@/integrations/google/gmail.server"),
  k: string,
  fromEmail: string,
  p: {
    to: string;
    subject: string;
    body: string;
    brand: DraftBrand;
    headers: { threadId?: string; inReplyTo?: string; references?: string };
    photo?: boolean;
    topic?: string | null;
  },
): Promise<boolean> {
  // The answer comes first; the "automatic reply" explanation sits below it.
  const body = `${p.body.trim()}\n\n${AUTO_DISCLAIMER}`;
  // Photography leads get the gallery + the photography page + the chat; rentals just the chat.
  const ctas = p.photo
    ? {
        cta: { label: "לגלריה של מיכל", url: CTA_URLS.gallery },
        extraCtas: [{ label: "לפרטים על הצילומים", url: CTA_URLS.photography }, AUTO_CHAT_CTA],
        siteSignature: true,
      }
    : p.topic === "props"
      ? { cta: { label: "לקטלוג האביזרים", url: CTA_URLS.props }, extraCtas: [AUTO_CHAT_CTA] }
      : {
          cta: { label: "לבדיקת זמינות והזמנת הסטודיו", url: CTA_URLS.booking },
          extraCtas: [{ label: "לפרטים על הסטודיו", url: CTA_URLS.studio }, AUTO_CHAT_CTA],
        };
  const draftId = await g.createGmailHtmlDraft({
    connKey: k,
    fromEmail,
    fromName: p.brand === "studio" ? "סטודיו Sweetbaby" : "מיכל סיבוני",
    to: p.to,
    subject: p.subject,
    html: buildDraftHtml({ brand: p.brand, body, ...ctas }),
    text: buildDraftText({ brand: p.brand, body, ...ctas }),
    ...p.headers,
  });
  if (!draftId) return false;
  const sent = await g.gmailApi(k, "/users/me/drafts/send", { method: "POST", body: { id: draftId } });
  if (!sent) {
    // Not sent — don't leave a second, duplicate draft behind.
    await g.gmailApi(k, `/users/me/drafts/${draftId}`, { method: "DELETE" });
    return false;
  }
  return true;
}

/**
 * Real free studio dates (from the same availability data the site and the
 * bot use), handed to the writer so a studio inquiry gets 2-3 concrete dates
 * and a booking link instead of "what date suits you?". Fetched at most once
 * per run, and only when the email is about the studio / a date.
 */
const STUDIO_DATE_HINT = /סטודיו|שריון|לשריין|פנוי|זמינ|תאריך|מועד|להשכיר|השכרה|studio/i;
async function freeDatesBlock(): Promise<string> {
  try {
    const { nextAvailableDays } = await import("./availability.server");
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    const days = await nextAvailableDays(today, 2, 21, 4);
    if (!days.length) return "";
    const lines = days.map((d) => {
      const day = new Date(`${d.date}T12:00:00`).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric" });
      return `- ${day}: פנוי החל מ-${d.firstStart} (לפחות שעתיים רצופות)`;
    });
    return lines.join("\n");
  } catch (e) {
    console.error("[SWEETBABY] free dates for drafts failed", e);
    return "";
  }
}

async function analyze(subject: string, text: string, past: string, isSiteForm: boolean, freeDates = "", siteInquiry = false): Promise<Analysis | null> {
  const { text: out } = await generateTextResilient(
    {
      system: WRITER_RULES,
      prompt: `${siteInquiry ? "זו התראה אוטומטית שהאתר (של מיכל או של הסטודיו) שלח למיכל על פנייה חדשה של לקוחה (טופס, צ'אט, שאלון התאמה או ליד). פרטי הלקוחה (שם/טלפון/אימייל/מה ביקשה) בגוף ההודעה — המייל עצמו לא נכתב על ידי הלקוחה. זו כן פנייה שמחכה למענה: needsReply=true (אלא אם זה ספאם ברור), isClient=true, clientEmail = האימייל של הלקוחה (לא של מיכל ולא של האתר). התשובה תישלח כמייל חדש לכתובת של הלקוחה: טיוטה חמה, קצרה וממוקדת במה שביקשה, בלי להבטיח מועד או מחיר שאינם בידע; אם יש רק שם ואימייל — 'תודה, איך אפשר לעזור' + מידע עיקרי, במותג המתאים.\n\n" : ""}${isSiteForm ? "זו הודעה מטופס יצירת הקשר באתר של מיכל — פרטי הלקוחה (שם/טלפון/אימייל/שאלה) בגוף ההודעה. התשובה תישלח כמייל חדש לכתובת של הלקוחה. אם יש רק שם ואימייל בלי שאלה — טיוטה קצרה וחמה של 'תודה, איך אפשר לעזור' + מידע עיקרי, במותג photographer.\n\n" : ""}נושא: ${subject}\n\nהשרשור (ההודעה האחרונה בסוף):\n${text}\n\n${past ? `תשובות קודמות של מיכל בנושא דומה (להעדיף את הניסוח והעובדות שלה):\n${past}\n\n` : ""}${freeDates ? `מועדים פנויים אמיתיים בסטודיו כרגע (מהיומן): \n${freeDates}\nכשהפונה שואלת על השכרת הסטודיו / תאריך / זמינות ואין לה תאריך מדויק, או שהתאריך שביקשה לא מתאים — הציעי בגוף המייל 2–3 מהמועדים האלה (בניסוח "נכון לעכשיו פנוי", בלי להבטיח — השריון נקבע בהזמנה) והציבי cta="booking" כדי שיופיע קישור לשריון. אם היא ביקשה תאריך מסוים — ענו על התאריך שלה קודם. אל תציעי מועדים כשהשאלה לא קשורה לסטודיו.\n\n` : ""}החזירי JSON בלבד (בלי טקסט נוסף):
{"needsReply": true/false — false לניוזלטר/פרסומת/קבוצה/הודעה אוטומטית/קבלה/משהו שלא מחכה לתשובה של מיכל. false גם כשההודעה האחרונה סוגרת את השיחה ולא שואלת כלום (\"תודה\", \"לא רלוונטי לי, תודה בכל אופן\", \"אוקיי\", \"מעולה\", 👍),
"brand": "photographer" (צילומים של מיכל, סל לידה, חבילות, גלריה, אלבומים) | "studio" (השכרת סטודיו, אביזרים, קולאז׳, חוקי הסטודיו) | "general" (ספקים, שותפים, כל השאר),
"topic": "newborn"|"birth_basket"|"upsherin"|"family"|"outdoor"|"studio"|"props"|"other",
"isClient": true/false,
"clientName": "שם פרטי", "clientEmail": "", "clientPhone": "",
"question": "שורה קצרה: מה היא שאלה",
"priceList": "newborn"|"outdoor"|"both"|"none" — רק אם שאלו על מחירים/חבילות ובמותג photographer,
"photos": "newborn"|"family"|"none" — תמונות לדוגמה בראש המייל (רק photographer ורק ללקוחה ששואלת על צילומים). "newborn" = תינוקות; "family" = ילדים גדולים ומשפחות — לשאלה על ניו בורן / סל לידה תמיד "newborn", לעולם לא "family",
"bigPhotos": true אם היא אמרה שהאתר חסום / ביקשה לראות תמונות,
"cta": "gallery"|"photography"|"studio"|"booking"|"props"|"collage"|null — כפתור רק אם הוא הצעד הבא הטבעי בדיוק למה שנשאלה, ורק ללקוחה; אחרת null (ברירת מחדל null),
"subject": "נושא למייל חדש (רק לטופס מהאתר)",
"body": "גוף הטיוטה לפי כללי העיצוב",
"summary": "שורה אחת למיכל: מי ומה",
"flags": ["דברים שמיכל צריכה לבדוק/להשלים"],
"urgent": true/false — true רק כשזו לקוחה (isClient) שפונה בנושא הזמנת סטודיו או השכרת אביזרים (topic studio/props) והעניין דחוף בזמן: מועד ההשכרה/הצילום היום או בתוך 48 שעות, בעיה ביום ההשכרה (הגעה, כניסה לסטודיו, תשלום, ציוד), שינוי/ביטול/אישור של הזמנה קיימת, או שביקשה במפורש תשובה מהירה. false לכל השאר — שאלות כלליות או על מחירים, צילומים של מיכל, סל לידה, ספקים, עמיתות, ובכל ספק,
"needsGuidance": true/false — true כשזו פונה (isClient) בנושא סטודיו או אביזרים (topic studio/props) שנראה שהיא לא יודעת שאפשר להזמין/לשריין/לבדוק זמינות לבד באתר או דרך הבוט: שואלת "איך מזמינים / איך משריינים", "אפשר להזמין?", "פנוי בתאריך X?" ובקשות שהאתר והבוט עושים בעצמם, מבקשת שנחזור אליה עם פרטים כדי להזמין, או כותבת במייל/בטלפון דברים שהאתר מטפל בהם. false לשאלות שבאמת דורשות את מיכל (הנחה מיוחדת, בקשה חריגה, תלונה, שיתוף פעולה) ובכל ספק,
"photoLead": true/false — true כשזו פונה חדשה (isClient, מיכל עוד לא ענתה בשרשור) שמתעניינת בצילומים של מיכל עצמה (brand photographer; topic newborn/birth_basket/upsherin/family/outdoor), גם אם היא רק שואלת בכללי על צילומים/חבילות/מחירים. false לספקים, עמיתות, שולמית, ובקשה קיימת/מורכבת שדורשת את מיכל,
"autoBody": "הטקסט שיופיע ראשון במענה האוטומטי — התשובה עצמה, בלי הקדמות על בוט (ההסבר 'מענה אוטומטי' נוסף אוטומטית מתחתיה). בלי קישורים וכתובות אתר בטקסט — כפתורים מתאימים (קטלוג/הזמנת סטודיו/גלריה/צ׳אט) מתווספים אוטומטית מתחת, אפשר להפנות אליהם במילים ('בכפתור למטה'). כש-photoLead=true: מענה מכבד וחם ללקוחה חדשה: להודות על הפנייה ולשקף במשפט אחד מה ביקשה, להפנות לכפתורים — עמוד הצילומים וגלריית העבודות של מיכל — לפי מה שביקשה, ולציין שבינתיים אפשר להתרשם בעבודות של מיכל באתר מיכל סיבוני. אסור להבטיח שמיכל תחזור אליה, אסור בהחלט להזכיר מחירים או חבילות, ואסור להבטיח תאריכים/זמינות. 3–5 שורות. אחרת, רק כש-urgent=true או needsGuidance=true: מענה קצר של 2–5 שורות: חמה, מאשרת שהפנייה התקבלה ועונה ככל שאפשר בלי להמציא. כש-needsGuidance — להסביר בפשטות שאפשר לבדוק זמינות, לשריין ולהזמין לבד בכל שעה (סטודיו: כפתור הזמנת הסטודיו · אביזרים: כפתור קטלוג האביזרים), או פשוט לשוחח עם סוויטבוט בצ׳אט שבודק זמינות אמיתית ומבצע את ההזמנה בקלות. אסור להבטיח זמינות, מחיר או אישור שלא ידועים, ואסור להמציא עובדות. אסור להתחייב שמיכל תחזור אליה (ההסבר מתחת כבר אומר שאם יהיה צורך היא תחזור). בלי הצהרת בוט ובלי הסתייגות, בלי חתימה"}`,
    },
    45_000,
  );
  return parseJson<Analysis>(out);
}

async function writeFollowUp(text: string): Promise<{ isClientInquiry: boolean; brand: DraftBrand; clientName?: string; body: string; summary: string } | null> {
  const { text: out } = await generateTextResilient(
    {
      system: WRITER_RULES,
      prompt: `זה שרשור שבו מיכל ענתה ללקוחה לפני כמה ימים והלקוחה לא חזרה. ההודעה האחרונה היא של מיכל.\n\n${text}\n\nהחזירי JSON בלבד:
{"isClientInquiry": true/false — true רק אם זו פנייה של לקוחה (צילומים, סל לידה, השכרת סטודיו/אביזרים), false לספקים/קבוצות/שולמית/משהו שנסגר או שהלקוחה אמרה שלא רלוונטי,
"brand": "photographer"|"studio"|"general" כמו בנושא המקורי,
"clientName": "שם פרטי",
"body": "מייל מעקב קצר של 3–4 שורות, חם ולא לוחץ, למשל: היי [שם], רציתי לבדוק אם הספקת לעבור על הפרטים 💗 אם יש שאלה או שתרצי לשריין מועד – אני כאן בשמחה. לניו בורן — להזכיר בעדינות שהגיל המומלץ עד שבועיים ולכן כדאי לשריין מוקדם.",
"summary": "שורה אחת למיכל"}`,
    },
    30_000,
  );
  return parseJson(out);
}

export type EmailDraftRunResult = {
  ran: boolean;
  reason?: string;
  account?: string;
  created: Array<{ to: string; summary: string; brand: DraftBrand; kind: "new" | "followup"; flags?: string[]; autoSent?: boolean }>;
  skipped: number;
  /** Answered threads whose leftover draft/label was cleaned up this run. */
  cleaned?: number;
  errors: string[];
};

// Owner switch (2026-11-17): false = the site does not send the family-room client mail (Claude sends it instead).
const FAMILY_ROOM_SITE_MAIL_ENABLED = false;

export async function runEmailDraftAssistant(
  opts: { force?: boolean; limits?: DraftRunLimits; minGapMs?: number } = {},
): Promise<EmailDraftRunResult> {
  const lim = opts.limits ?? LEGACY_DRAFT_LIMITS;
  const result: EmailDraftRunResult = { ran: false, created: [], skipped: 0, errors: [] };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { weekday, hour, minute } = israelParts();
  if (!opts.force) {
    if (weekday === "Sat" || (weekday === "Fri" && hour >= 14)) return { ...result, reason: "shabbat" };
    // Owner request 2026-11-04: active 07:30–23:50 Israel time (was around the clock since 2026-11-02),
    // a run about every 10 minutes. Shabbat (Fri 14:00 → Sat night) stays off.
    const minutesOfDay = hour * 60 + minute;
    if (minutesOfDay < WINDOW_START_MIN || minutesOfDay > WINDOW_END_MIN) return { ...result, reason: "outside_hours" };
    const last = await getSetting(db, LAST_RUN_KEY);
    const gapMs = opts.minGapMs ?? (minutesOfDay >= PEAK_START_MIN && minutesOfDay < PEAK_END_MIN ? PEAK_GAP_MS : MIN_GAP_MS);
    if (last && Date.now() - Date.parse(last) < gapMs) return { ...result, reason: "too_soon" };
  }
  await setSetting(db, LAST_RUN_KEY, new Date().toISOString());

  const g = await import("@/integrations/google/gmail.server");
  const acc = (await g.resolveGmailAccount("m0548529277@gmail.com")) ?? (await g.resolveGmailAccount());
  const accounts = (await g.listGmailAccounts()).map((a) => a.email);
  if (!acc) {
    result.reason = "no_gmail";
    await setSetting(db, STATUS_KEY, JSON.stringify({ at: new Date().toISOString(), accounts, reason: "no_gmail" }));
    return result;
  }
  result.ran = true;
  result.account = acc.email;
  const k = acc.connKey;

  const seen: Seen = JSON.parse((await getSetting(db, SEEN_KEY)) || '{"ids":[]}');
  const seenSet = new Set(seen.ids);
  // The seen list is saved as the run goes (not only at its very end): the hourly route can be cut off from outside before a
  // slow run finishes, and a list saved only at the end then never grows — the same first threads get analysed again and
  // again (and the quiz-lead notes pile up) while the threads further down are never reached.
  let seenDirty = false;
  const remember = (id: string) => {
    if (!seenSet.has(id)) {
      seenSet.add(id);
      seen.ids.push(id);
      seenDirty = true;
    }
  };
  // Saves are chained so that several threads finishing at the same time (parallel analysis) can never write the list out
  // of order and leave an older copy as the final one.
  let flushChain: Promise<void> = Promise.resolve();
  const flushSeen = () => {
    flushChain = flushChain.then(async () => {
      if (!seenDirty) return;
      seenDirty = false;
      seen.ids = seen.ids.slice(-500);
      try {
        await setSetting(db, SEEN_KEY, JSON.stringify(seen));
      } catch (e) {
        console.error("[SWEETBABY] email-drafts seen save failed", e);
      }
    });
    return flushChain;
  };
  const runStartedAt = Date.now();
  let pendingThreads = 0; // waiting threads this run had no time for (shown in the admin tile)

  let photos: { newborn: string[]; family: string[] } = { newborn: [], family: [] };
  try {
    photos = { ...photos, ...JSON.parse((await getSetting(db, PHOTOS_KEY)) || "{}") };
    // Signed storage URLs sit on a host that filtered networks block -> send them through the site's /media proxy.
    photos = {
      newborn: (photos.newborn ?? []).map((u) => emailThumbUrl(u, 600)),
      family: (photos.family ?? []).map((u) => emailThumbUrl(u, 600)),
    };
  } catch {
    /* no sample photos */
  }

  const design = await readEmailDesign();
  try {
    const labels = await ensureLabels(g, k);
    const readyId = labels.get(LABEL_READY);
    const allDrafts = await listAllDrafts(g, k);
    if (!allDrafts) throw new Error("רשימת הטיוטות בג׳ימייל לא נטענה");
    // ---------- cleanup: threads she already answered ----------
    let liveDrafts = allDrafts;
    if (readyId) {
      try {
        const c = await cleanupAnsweredThreads(g, k, readyId, labels.get(LABEL_SENT), allDrafts);
        result.cleaned = c.threads;
        liveDrafts = allDrafts.filter((d) => !c.deletedDraftIds.has(d.id));
      } catch (e: any) {
        result.errors.push(`ניקוי: ${String(e?.message ?? e).slice(0, 120)}`);
      }
      try {
        const gone = await removeEmptyTemplateDrafts(g, k, readyId, liveDrafts);
        if (gone.size) liveDrafts = liveDrafts.filter((d) => !gone.has(d.id));
      } catch (e: any) {
        result.errors.push(`ניקוי טיוטות ריקות: ${String(e?.message ?? e).slice(0, 120)}`);
      }
    }
    // Any open draft in a thread — made here, by Claude chat or by her — means
    // "someone is already on it": never add a second draft to that thread.
    const draftThreads = new Set(liveDrafts.map((d) => d.message?.threadId).filter(Boolean) as string[]);

    // ---------- quiz leads from the photographer site ----------
    // The photographer site's package quiz mails every lead to Michal FROM her own address, which the rules below skip
    // (they are her own mail). These few mails are the exception: they become an inquiry lead (so the hourly
    // follow-up digest lists them). The reply draft itself (when she left an e-mail) is made by the "new inquiries" block
    // below, which also reads these mails (see SITE_INQUIRY_SUBJECT).
    try {
      const qList = await g.gmailApi<{ messages?: Array<{ id: string; threadId: string }> }>(
        k,
        `/users/me/messages?maxResults=15&q=${encodeURIComponent('newer_than:3d from:me (subject:"מהשאלון" OR subject:"בחרה בחבילה")')}`,
      );
      const threaded = await g.gmailApi<{ messages?: Array<{ id: string; threadId: string }> }>(
        k,
        `/users/me/messages?maxResults=40&q=${encodeURIComponent(LEAD_THREAD_QUERY)}`,
      );
      const inLeadThread = new Set((threaded?.messages ?? []).map((m) => m.id));
      for (const qm of [...(qList?.messages ?? []).filter((m) => !inLeadThread.has(m.id)), ...(threaded?.messages ?? [])]) {
        if (seenSet.has(`qz:${qm.id}`)) continue;
        const full = await g.gmailApi<any>(k, `/users/me/messages/${qm.id}?format=full`);
        if (!full) continue;
        const subj = effectiveSubject(
          g.gmailHeaderValue(full.payload?.headers, "Subject") || "",
          g.gmailHeaderValue(full.payload?.headers, LEAD_SUBJECT_HEADER),
        );
        const body = g.extractGmailPlainText(full.payload) || full.snippet || "";
        remember(`qz:${qm.id}`);
        // The daily lead thread also holds visitor alerts and studio-funnel notices: only photographer quiz notices here.
        if (!/מהשאלון|בחרה בחבילה/.test(subj)) continue;
        const phone = body.match(/(?:טלפון)\s*:?\s*(\+?[\d][\d\- ]{7,16}\d)/)?.[1]?.replace(/[^\d+]/g, "") ?? null;
        const mail = body.match(/(?:מייל)\s*:?\s*([^\s@]+@[^\s@]+\.[^\s@]+)/)?.[1] ?? null;
        const choice = /בחרה בחבילה/.test(subj);
        const name = (choice ? subj.match(/💗?\s*(.+?)\s+בחרה בחבילה/)?.[1] : subj.split("·")[1])?.trim() || null;
        const pkg = (choice ? subj.match(/בחבילה:\s*(.+)$/)?.[1] : subj.split("·")[2])?.trim() || "";
        if (!name || (!phone && !mail)) continue;
        const hot = /ליד חם/.test(subj);
        await upsertLead(db, {
          name,
          email: mail,
          phone,
          source: "quiz_photographer",
          topic: "other",
          message: `${hot ? "🔥 ליד חם · " : ""}${choice ? "בחרה בסיום השאלון" : "מילאה את שאלון התאמת החבילה באתר הצלמת"}${pkg ? ` · ${pkg}` : ""}`,
          status: "new",
          // A shared lead thread must not tie different people to one lead.
          gmail_thread_id: inLeadThread.has(qm.id) ? null : qm.threadId,
          notes: "מאתר הצלמת (שאלון) — לא נשלחה שום הודעה אליה (אם השאירה מייל, מחכה לה טיוטת תשובה).",
        });
      }
    } catch (e) {
      result.errors.push(`quiz mails: ${String((e as any)?.message ?? e).slice(0, 100)}`);
    }

    await flushSeen();

    // ---------- family-room answers (the room booked — or not — for a client at Yaner Clinics) ----------
    // The owner (or Claude, when it books the room) mails FROM Michal's address:
    //   subject "אישור חדר משפחה"   -> booked; body lines: "הזמנה: #<first 8 chars of the booking id>", "תאריך: DD.MM.YYYY", "שעות: 18:00, 19:00"
    //                                  (only the hours that really were booked — a part of the session is fine)
    //   subject "חדר משפחה לא נקבע"  -> could not be booked; same "הזמנה:" / "תאריך:" lines, no hours needed.
    // The hours are saved on the studio booking (client area + admin). Then ONE studio-design mail goes to the client at once
    // (booked: approved hours + entrance + code; not booked: plain note + "change date" button) — never on Shabbat / the hours around it
    // (it then waits for the next run). Each mail is handled once: `fr:` = saved, `frm:` = client mail sent. A mail that cannot be matched
    // to exactly one booking is reported in the run errors and nothing is sent.
    // FREE TEXT also works (2026-11-12): any mail from her containing "קבעתי" / "לא קבעתי" / "תפוס" whose quoted order summary carries "#<8 chars>"
    // of a booking whose client asked for the room; no hours named = the whole session; hours/range named = only those (`family-room-reply.ts`).
    try {
      const { isQuietForMail } = await import("./mail-quiet-hours");
      const fList = await g.gmailApi<{ messages?: Array<{ id: string; threadId: string }> }>(
        k,
        `/users/me/messages?maxResults=15&q=${encodeURIComponent('newer_than:7d (from:me OR from:xv05832@gmail.com) (subject:"אישור חדר משפחה" OR subject:"חדר משפחה לא נקבע" OR קבעתי OR "לא נקבע" OR תפוס)')}`,
      );
      for (const fm of fList?.messages ?? []) {
        const saved = seenSet.has(`fr:${fm.id}`);
        if (saved && seenSet.has(`frm:${fm.id}`)) continue;
        const full = await g.gmailApi<any>(k, `/users/me/messages/${fm.id}?format=full`);
        if (!full) continue;
        const body = g.extractGmailPlainText(full.payload) || full.snippet || "";
        const subj = g.gmailHeaderValue(full.payload?.headers, "Subject") || "";
        // The site's own client mails ("חדר המשפחה נקבע" / "חדר המשפחה — עדכון", copy to the studio = "from me") must never be read back as answers.
        if (/לצילום של מיכל/.test(subj) || /^\s*(Re:\s*)?חדר המשפחה\s*(נקבע|—|-)/i.test(subj) || /אישור הזמנה|תזכורת/.test(subj)) {
          remember(`fr:${fm.id}`);
          remember(`frm:${fm.id}`);
          continue;
        }
        // Two ways to answer: the fixed subjects below (strict, reports problems), or a FREE-TEXT reply such as just "קבעתי"
        // (owner request 2026-11-12) — then the order id comes from the quoted mail and the client must have asked for the room.
        const conv = /אישור חדר משפחה|חדר משפחה לא נקבע/.test(subj);
        let idPrefix: string | null;
        let slots: string;
        let notBooked: boolean;
        let mailDate: string | null = null;
        let mailName: string | null = null;
        if (conv) {
          idPrefix = body.match(/הזמנה\s*:?\s*#?\s*([0-9a-f]{8})\b/i)?.[1]?.toLowerCase() ?? null;
          slots = body.match(/שעות\s*:?\s*([^\n\r]+)/)?.[1]?.trim().slice(0, 200) ?? "";
          notBooked = /חדר משפחה לא נקבע/.test(subj) || (!slots && /לא (נקבע|קבעתי)/.test(body));
          const dm = body.match(/תאריך\s*:?\s*(\d{1,2})[./](\d{1,2})[./](\d{4})/);
          mailDate = dm ? `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}` : null;
          // Automatic Yaner task (2026-11-12): no order id, only "שם: <client>" + date -> narrowed by name below.
          mailName = body.match(/(?:^|\n)\s*שם\s*:\s*([^\n\r]{2,60})/)?.[1]?.trim() ?? null;
          if ((!notBooked && !slots) || (!idPrefix && !mailDate)) {
            remember(`fr:${fm.id}`);
            remember(`frm:${fm.id}`);
            result.errors.push(`family room mail ${fm.id.slice(0, 8)}: missing hours or booking reference`);
            continue;
          }
        } else {
          const fr = parseFamilyRoomReply(body);
          if (!fr.decision || (!fr.idPrefix && !fr.date)) {
            remember(`fr:${fm.id}`);
            remember(`frm:${fm.id}`);
            continue; // not about the family room — stay silent
          }
          idPrefix = fr.idPrefix;
          mailDate = fr.date;
          mailName = fr.name;
          notBooked = fr.decision === "not_booked";
          slots = fr.hours; // empty = the whole session, filled in below once the booking is known
        }
        const { data: cand } = await db
          .from("bookings")
          .select("id, user_id, session_date, start_time, end_time, contact_name, contact_email, family_room_booked_at")
          .gte("session_date", new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10));
        const rows = (cand ?? []) as Array<{ id: string; user_id: string; session_date: string; start_time: string; end_time: string; contact_name: string | null; contact_email: string | null; family_room_booked_at: string | null }>;
        const norm = (x: string | null | undefined) => String(x ?? "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        let hit = idPrefix
          ? rows.filter((r) => r.id.toLowerCase().startsWith(idPrefix!))
          : rows.filter((r) => r.session_date === mailDate);
        // The studio-rental notification to the room booker carries no order id, only "1. <name>" + date: narrow by name.
        if (!idPrefix && hit.length > 1 && mailName) {
          const n = norm(mailName);
          hit = hit.filter((r) => norm(r.contact_name) === n || norm(r.contact_name).includes(n) || n.includes(norm(r.contact_name)));
        }
        if (hit.length !== 1) {
          remember(`fr:${fm.id}`);
          remember(`frm:${fm.id}`);
          if (conv) result.errors.push(`family room mail ${fm.id.slice(0, 8)}: ${hit.length} matching bookings`);
          continue;
        }
        if (!conv) {
          // Free text: only for a client who actually asked for the room in her questionnaire.
          const { data: intake } = await db
            .from("studio_intake_forms")
            .select("payload")
            .eq("user_id", hit[0].user_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!String(intake?.payload?.familyRoom ?? "").startsWith("מעוניינת")) {
            remember(`fr:${fm.id}`);
            remember(`frm:${fm.id}`);
            continue;
          }
          if (!notBooked && !slots) slots = hourlySlots(hit[0].start_time, hit[0].end_time);
        }
        const bk = hit[0];
        // Free-text answers act once per booking: if this booking was already handled (hours saved or "not booked" marked), later mails
        // (her thank-you reply that quotes "קבעתי", copies, etc.) are only remembered — they must not trigger another client mail.
        if (!conv && !saved && bk.family_room_booked_at) {
          remember(`fr:${fm.id}`);
          remember(`frm:${fm.id}`);
          continue;
        }
        if (!saved) {
          await db
            .from("bookings")
            .update(notBooked ? { family_room_slots: null, family_room_booked_at: new Date().toISOString() } : { family_room_slots: slots, family_room_booked_at: new Date().toISOString() })
            .eq("id", bk.id);
          remember(`fr:${fm.id}`);
        }
        // 2026-11-17 (owner): the site NO LONGER mails the client about the family room. The hours are still saved above
        // (admin + client area), but the client mail is now written and sent by Claude (scheduled task) in the studio design.
        // This also stops the repeated copies that were arriving every ~15 minutes.
        if (!FAMILY_ROOM_SITE_MAIL_ENABLED) {
          remember(`frm:${fm.id}`);
          continue;
        }
        if (isQuietForMail()) continue; // Shabbat window: keep `frm:` unset, the next run sends it
        const { data: u } = await db.auth.admin.getUserById(bk.user_id);
        const { isPlaceholderEmail } = await import("@/lib/auth.functions");
        const pick = (e?: string | null) => (e && e.trim() && !isPlaceholderEmail(e.trim()) ? e.trim() : undefined);
        const to = pick(bk.contact_email) ?? pick(u?.user?.email);
        if (!to) {
          remember(`frm:${fm.id}`);
          result.errors.push(`family room mail ${fm.id.slice(0, 8)}: booking ${bk.id.slice(0, 8)} has no customer e-mail`);
          continue;
        }
        const { buildFamilyRoomResultHtml } = await import("./orderSummary");
        const { sendStudioAndCustomer } = await import("@/integrations/google/gmail.server");
        await sendStudioAndCustomer({
          customerEmail: to,
          subject: notBooked ? "חדר המשפחה — עדכון" : "חדר המשפחה נקבע",
          html: buildFamilyRoomResultHtml({ booked: !notBooked, slots, booking: bk }),
        });
        remember(`frm:${fm.id}`);
      }
    } catch (e) {
      result.errors.push(`family room mails: ${String((e as any)?.message ?? e).slice(0, 100)}`);
    }

    // ---------- new inquiries ----------
    // Seen = the newest message id per thread, so a client writing again in
    // an old thread is looked at again; threads Michal answered last are
    // skipped below, threads with an open draft are skipped here.
    const q = `in:inbox newer_than:2d -from:me -category:promotions -category:social -category:forums`;
    const list = await g.gmailApi<{ messages?: Array<{ id: string; threadId: string }> }>(
      k,
      `/users/me/messages?maxResults=30&q=${encodeURIComponent(q)}`,
    );
    const newestByThread = new Map<string, string>();
    for (const m of list?.messages ?? []) if (!newestByThread.has(m.threadId)) newestByThread.set(m.threadId, m.id);
    // Inquiry notices the sites mailed from the studio address to itself (excluded above by -from:me).
    const siteNoticeThreads: string[] = [];
    try {
      const siteList = await g.gmailApi<{ messages?: Array<{ id: string; threadId: string }> }>(
        k,
        `/users/me/messages?maxResults=20&q=${encodeURIComponent(SITE_INQUIRY_QUERY)}`,
      );
      for (const m of siteList?.messages ?? []) {
        siteNoticeThreads.push(m.threadId);
        if (!newestByThread.has(m.threadId)) newestByThread.set(m.threadId, m.id);
      }
    } catch (e) {
      result.errors.push(`site inquiries: ${String((e as any)?.message ?? e).slice(0, 100)}`);
    }
    // Notices inside the daily lead thread are separate inquiries: each MESSAGE is its own unit of work.
    type Unit = { threadId: string; leadMessageId?: string };
    const leadUnits: Unit[] = [];
    try {
      const leadList = await g.gmailApi<{ messages?: Array<{ id: string; threadId: string }> }>(
        k,
        `/users/me/messages?maxResults=40&q=${encodeURIComponent(LEAD_THREAD_QUERY)}`,
      );
      const leadThreads = new Set<string>();
      for (const m of leadList?.messages ?? []) {
        leadThreads.add(m.threadId);
        if (!seenSet.has(m.id)) leadUnits.push({ threadId: m.threadId, leadMessageId: m.id });
      }
      for (const t of leadThreads) newestByThread.delete(t);
    } catch (e) {
      result.errors.push(`lead thread: ${String((e as any)?.message ?? e).slice(0, 100)}`);
    }
    const waiting = [...newestByThread.entries()]
      .filter(([t, mid]) => !seenSet.has(mid) && !draftThreads.has(t))
      .map(([t]) => t);
    // Site inquiry notices first: a customer who left an e-mail on one of the sites is the thing the owner wants answered
    // soonest, and when a run only has time for a few threads they must not queue behind ordinary inbox mail.
    const siteThreadIds = new Set(siteNoticeThreads);
    const units: Unit[] = [
      ...leadUnits,
      ...waiting.filter((t) => siteThreadIds.has(t)).map((threadId) => ({ threadId })),
      ...waiting.filter((t) => !siteThreadIds.has(t)).map((threadId) => ({ threadId })),
    ];

    let made = 0;
    let autoRun = 0;
    let freeDatesP: Promise<string> | null = null; // one calendar lookup per run, shared by every thread
    let aiDown = false; // the AI failed: no new thread is started this run
    const claimedEmails = new Set<string>(); // customer e-mails a site-notice thread is already working on
    const autoDay = await loadAutoDay(db);
    const autoLabelId = labels.get(LABEL_AUTO);
    await flushSeen();
    let analysed = 0; // threads actually sent to the AI (cheap skips do not count)
    let visited = 0;
    let budgetHit = false;
    // Waiting threads are analysed by a small pool of workers (`lim.concurrency`): the AI call dominates the time per thread
    // (~25 s), so three at once drain the queue about three times faster. Everything shared (`made`, `autoRun`, the seen
    // list, the claimed e-mails) is only changed between awaits, so no thread can see a half-updated value.
    const queue = [...units];
    const processThread = async ({ threadId, leadMessageId }: Unit): Promise<void> => {
      visited++;
      const th = await g.gmailApi<{ messages?: any[] }>(k, `/users/me/threads/${threadId}?format=full`);
      const msgs = (th?.messages ?? []).filter((m: any) => !leadMessageId || m.id === leadMessageId);
      const last = msgs[msgs.length - 1];
      if (!last) return;
      const seenId: string = last.id;
      const h = last.payload?.headers;
      const from = g.gmailHeaderValue(h, "From");
      const fromAddr = addrOf(from);
      const isSiteForm = fromAddr.endsWith(SITE_FORM_SENDER);
      const subject = effectiveSubject(g.gmailHeaderValue(h, "Subject") || "", g.gmailHeaderValue(h, LEAD_SUBJECT_HEADER));
      // Notices sent from the studio address — m now, the old s address until 17.11 — are the sites' own mail.
      const fromOwnAddress = isOwner(fromAddr) || isOwnStudioAddress(fromAddr);
      const isSiteInquiry = fromOwnAddress && SITE_INQUIRY_SUBJECT.test(subject);
      // The notices the sites mail to the studio inbox get their type label here (the studio site labels its own mail when
      // it sends it; the photographer site's notices only pass through this scan). Best effort, never blocks the draft.
      if (fromOwnAddress) {
        try {
          if (leadMessageId) await g.labelSiteMailMessage(k, leadMessageId, subject);
          else await g.labelSiteMailThread(k, threadId, subject, msgs.flatMap((m: any) => m.labelIds ?? []));
        } catch (e) {
          result.errors.push(`label: ${String((e as any)?.message ?? e).slice(0, 80)}`);
        }
      }
      const autoSubmitted = (g.gmailHeaderValue(h, "Auto-Submitted") || "no").toLowerCase();
      const auto =
        /no-?reply|mailer-daemon|notification|newsletter|bounce/i.test(fromAddr) ||
        (!!g.gmailHeaderValue(h, "List-Id") && !isSiteForm) ||
        autoSubmitted !== "no";
      if ((fromOwnAddress && !isSiteInquiry) || auto) {
        remember(seenId);
        result.skipped++;
        return;
      }
      const text = threadText(g, msgs);
      // A site notice with no customer e-mail in it (a phone message, a chat that left only a phone number) has nobody to
      // write to: it stays a lead for the follow-up digest and gets no draft (and no AI call).
      const noticeEmail = isSiteInquiry ? customerEmailInNotice(text) : null;
      if (isSiteInquiry && !noticeEmail) {
        remember(seenId);
        result.skipped++;
        return;
      }
      analysed++;
      let a: Analysis | null = null;
      try {
        const wantsDates = STUDIO_DATE_HINT.test(`${subject}\n${text}`);
        if (wantsDates) freeDatesP ??= freeDatesBlock();
        const dates = wantsDates ? await freeDatesP! : "";
        a = await analyze(subject, text, await pastAnswers(g, k, `${subject}\n${text}`), isSiteForm, dates, isSiteInquiry);
      } catch (e: any) {
        result.errors.push(`AI: ${String(e?.message ?? e).slice(0, 120)}`);
        aiDown = true; // AI down — try again next run, don't mark as seen
        return;
      }
      if (!a) {
        result.errors.push("AI returned no JSON");
        return;
      }
      if (!a.needsReply || !a.body?.trim()) {
        remember(seenId);
        result.skipped++;
        return;
      }

      let to = from;
      let replyHeaders: { threadId?: string; inReplyTo?: string; references?: string } = {
        threadId,
        inReplyTo: g.gmailHeaderValue(h, "Message-ID") || g.gmailHeaderValue(h, "Message-Id"),
        references: [g.gmailHeaderValue(h, "References"), g.gmailHeaderValue(h, "Message-ID")].filter(Boolean).join(" "),
      };
      let draftSubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
      if (isSiteForm || isSiteInquiry) {
        // The address found in the notice itself wins over the model's reading of it.
        const email = (isSiteInquiry ? noticeEmail || "" : a.clientEmail || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          remember(seenId);
          result.errors.push(`טופס מהאתר בלי אימייל תקין (${a.clientName || "?"})`);
          return;
        }
        // Two notices of the same visitor can be analysed at the same moment (parallel run): only the first one to reach this
        // point may make her a draft, the other is a plain skip. The claim is taken before any await.
        if (claimedEmails.has(email.toLowerCase())) {
          remember(seenId);
          result.skipped++;
          return;
        }
        claimedEmails.add(email.toLowerCase());
        // Already answered her (or a draft to her exists)?
        // The sites' own automatic mails (prize-wheel gift, newsletter welcome) are not an answer to her inquiry: before this
        // exclusion the gift mail sent a minute earlier made the assistant skip the quiz notices of the same visitor (19.11).
        const sentTo = await g.searchGmail(`in:sent to:${email} newer_than:3d -subject:"הפרס שלך" -subject:"ברוכה הבאה"`, 1, k);
        const draftTo = await g.searchGmail(`in:draft to:${email}`, 1, k);
        if (sentTo.length || draftTo.length) {
          remember(seenId);
          result.skipped++;
          return;
        }
        to = email;
        replyHeaders = {};
        draftSubject = a.subject?.trim() || "תודה על הפנייה 💗";
      }

      const brand: DraftBrand = ["photographer", "studio", "general"].includes(a.brand) ? a.brand : "general";

      // ---------- urgent studio/props inquiry → automatic first reply ----------
      let autoSent = false;
      const answeredBefore = msgs.some((m) => isOwner(addrOf(g.gmailHeaderValue(m.payload?.headers, "From"))));
      const alreadyAuto = !!autoLabelId && msgs.some((m) => (m.labelIds ?? []).includes(autoLabelId));
      if (
        shouldAutoSend({
          a,
          brand,
          toAddr: addrOf(to),
          answeredBefore,
          alreadyAuto,
          runCount: autoRun,
          dayCount: autoDay.count,
        })
      ) {
        // Reserve the slot before the first await so parallel threads can never exceed the per-run / per-day caps together.
        autoRun++;
        autoDay.count++;
        try {
          autoSent = await sendAutoReply(g, k, acc.email, {
            to,
            subject: draftSubject,
            body: a.autoBody as string,
            brand,
            headers: replyHeaders,
            photo: brand === "photographer",
            topic: a.topic,
          });
        } catch (e: any) {
          result.errors.push(`מענה אוטומטי: ${String(e?.message ?? e).slice(0, 120)}`);
        }
        if (!autoSent) {
          autoRun--;
          autoDay.count--;
        }
        if (autoSent) {
          await setSetting(db, AUTO_DAY_KEY, JSON.stringify(autoDay));
          if (autoLabelId) {
            await g.gmailApi(k, `/users/me/threads/${threadId}/modify`, { method: "POST", body: { addLabelIds: [autoLabelId] } });
          }
          a.flags = ["נשלח מענה ראשוני אוטומטי — לעבור, לבדוק שהוא נכון ולענות בצורה אישית", ...(a.flags ?? [])];
        } else {
          a.flags = ["ניסיון מענה אוטומטי נכשל — הפנייה דחופה, לענות ידנית", ...(a.flags ?? [])];
        }
      }
      const ctaKey = a.cta && CTA_URLS[a.cta] ? a.cta : null;
      const cta = ctaKey
        ? {
            label:
              ({
                gallery: "לגלריה של מיכל",
                photography: "לפרטים על הצילומים",
                studio: "להשכרת הסטודיו",
                booking: "לבחירת מועד",
                props: "לקטלוג האביזרים",
                collage: "ליוצר הקולאז׳ים",
              } as Record<string, string>)[ctaKey],
            url: CTA_URLS[ctaKey],
          }
        : null;
      /* Newborn / birth-basket inquirers always get BABY photos, whatever the model picked (the "family" set is older children). */
      const babyTopic = a.topic === "newborn" || a.topic === "birth_basket";
      const photoKind = babyTopic && a.photos !== "none" ? "newborn" : a.photos;
      const photoSet = photoKind === "newborn" ? photos.newborn : photoKind === "family" ? photos.family : [];
      const html = buildDraftHtml({
        brand,
        body: a.body,
        priceList: a.priceList,
        photos: a.bigPhotos ? photoSet : photoSet.slice(0, 4),
        bigPhotos: !!a.bigPhotos,
        cardPhotos: {
          newborn: design.cardPhotos.newborn.length
            ? design.cardPhotos.newborn
            : NEWBORN_CARD_PHOTOS,
          outdoor: design.cardPhotos.outdoor.length ? design.cardPhotos.outdoor : OUTDOOR_CARD_PHOTOS,
        },
        cta,
      });
      const plain = buildDraftText({ brand, body: a.body, priceList: a.priceList, cta });
      const draftId = await g.createGmailHtmlDraft({
        connKey: k,
        fromEmail: acc.email,
        fromName: brand === "studio" ? "סטודיו Sweetbaby" : "מיכל סיבוני",
        to,
        subject: draftSubject,
        html,
        text: plain,
        ...replyHeaders,
      });
      if (!draftId) {
        result.errors.push(`יצירת טיוטה נכשלה (${a.clientName || addrOf(to)})`);
        return;
      }
      if (readyId && !leadMessageId) {
        await g.gmailApi(k, `/users/me/threads/${threadId}/modify`, { method: "POST", body: { addLabelIds: [readyId] } });
      }
      remember(seenId);
      made++;
      result.created.push({ to: addrOf(to), summary: a.summary, brand, kind: "new", flags: a.flags, autoSent });
      if (a.isClient || isSiteInquiry) {
        await upsertLead(db, {
          name: a.clientName || (isSiteInquiry ? "" : nameOf(from)) || null,
          email: isSiteForm || isSiteInquiry ? to : fromAddr,
          phone: a.clientPhone || null,
          source: isSiteInquiry ? "site_inquiry" : isSiteForm ? "site_form" : "email",
          topic: a.topic || "other",
          message: a.question || a.summary,
          status: "new",
          gmail_thread_id: leadMessageId ? null : threadId,
          // Marks "draft ready, not sent yet" for /admin/leads (status stays
          // "new" until she actually answers).
          notes: `${autoSent ? `${AUTO_REPLY_NOTE}. ` : ""}${DRAFT_READY_NOTE} ${new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}`,
        });
      }
    };
    const worker = async () => {
      for (;;) {
        if (aiDown || queue.length === 0) return;
        await flushSeen();
        // Always send at least one thread to the AI per run; after that stop starting new ones once the run has used its
        // time budget (the rest wait for the next run — nothing is lost, they are simply not remembered yet).
        const elapsed = Date.now() - runStartedAt;
        if (made >= lim.maxNew || elapsed > lim.hardBudgetMs || (analysed > 0 && elapsed > lim.runBudgetMs)) {
          budgetHit = made < lim.maxNew;
          return;
        }
        const unit = queue.shift();
        if (unit === undefined) return;
        await processThread(unit);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(lim.concurrency, queue.length || 1)) }, () => worker()));
    await flushSeen();

    pendingThreads = Math.max(0, units.length - visited);

    // ---------- follow-ups for clients who went quiet ----------
    // Lowest priority: only when the run still has time and nothing newer is left waiting (a run that skipped this pass is
    // simply picked up by a later one).
    if (!result.errors.some((e) => e.startsWith("AI")) && !budgetHit && Date.now() - runStartedAt < lim.runBudgetMs) {
      const fq = `in:sent older_than:3d newer_than:10d -label:"${LABEL_FOLLOW}" -label:"${LABEL_READY}"`;
      const sent = await g.gmailApi<{ messages?: Array<{ threadId: string }> }>(
        k,
        `/users/me/messages?maxResults=20&q=${encodeURIComponent(fq)}`,
      );
      const fThreads = [...new Set((sent?.messages ?? []).map((m) => m.threadId))].filter(
        (t) => !seenSet.has(`fu:${t}`) && !draftThreads.has(t),
      );
      let fu = 0;
      for (const threadId of fThreads) {
        if (fu >= lim.maxFollowups || Date.now() - runStartedAt > lim.hardBudgetMs) break;
        const th = await g.gmailApi<{ messages?: any[] }>(k, `/users/me/threads/${threadId}?format=full`);
        const msgs = th?.messages ?? [];
        const last = msgs[msgs.length - 1];
        const lastFrom = addrOf(g.gmailHeaderValue(last?.payload?.headers, "From"));
        const client = msgs.find((m) => !isOwner(addrOf(g.gmailHeaderValue(m.payload?.headers, "From"))));
        const clientAddr = client ? addrOf(g.gmailHeaderValue(client.payload?.headers, "From")) : "";
        // Only: Michal answered last, a real client wrote before, client never replied after her.
        if (
          !last ||
          !isOwner(lastFrom) ||
          !client ||
          clientAddr.endsWith(SITE_FORM_SENDER) ||
          /no-?reply|sb0527126888/.test(clientAddr) ||
          // her last two messages in a row = she already followed up herself
          (msgs.length >= 2 && isOwner(addrOf(g.gmailHeaderValue(msgs[msgs.length - 2].payload?.headers, "From"))))
        ) {
          remember(`fu:${threadId}`);
          continue;
        }
        // Don't nudge a client who already booked or was marked not relevant.
        const lead = await findLead(db, threadId, clientAddr);
        if (lead && ["booked", "not_relevant"].includes(lead.status)) {
          remember(`fu:${threadId}`);
          continue;
        }
        let w: Awaited<ReturnType<typeof writeFollowUp>> = null;
        try {
          w = await writeFollowUp(threadText(g, msgs));
        } catch (e: any) {
          result.errors.push(`AI: ${String(e?.message ?? e).slice(0, 120)}`);
          break;
        }
        remember(`fu:${threadId}`);
        if (!w || !w.isClientInquiry || !w.body?.trim()) continue;
        const lh = last.payload?.headers;
        const subj = g.gmailHeaderValue(lh, "Subject") || "";
        const brand: DraftBrand = ["photographer", "studio", "general"].includes(w.brand) ? w.brand : "general";
        const draftId = await g.createGmailHtmlDraft({
          connKey: k,
          fromEmail: acc.email,
          fromName: brand === "studio" ? "סטודיו Sweetbaby" : "מיכל סיבוני",
          to: clientAddr,
          subject: /^re:/i.test(subj) ? subj : `Re: ${subj}`,
          html: buildDraftHtml({ brand, body: w.body }),
          text: buildDraftText({ brand, body: w.body }),
          threadId,
          inReplyTo: g.gmailHeaderValue(lh, "Message-ID") || g.gmailHeaderValue(lh, "Message-Id"),
          references: [g.gmailHeaderValue(lh, "References"), g.gmailHeaderValue(lh, "Message-ID")].filter(Boolean).join(" "),
        });
        if (!draftId) continue;
        if (readyId) await g.gmailApi(k, `/users/me/threads/${threadId}/modify`, { method: "POST", body: { addLabelIds: [readyId] } });
        fu++;
        result.created.push({ to: clientAddr, summary: w.summary, brand, kind: "followup" });
        await markFollowUpDraft(db, lead, threadId, clientAddr);
      }
    }
  } catch (e: any) {
    console.error("[SWEETBABY] email-drafts run failed", e);
    result.errors.push(String(e?.message ?? e).slice(0, 200));
  }

  seen.ids = seen.ids.slice(-500);
  await setSetting(db, SEEN_KEY, JSON.stringify(seen));

  // Running per-day totals (Israel date) for the admin "drafts" indicator tile.
  const dayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  let todayCreated = 0;
  let todayAutoSent = 0;
  let lastDraftAt: string | null = result.created.length ? new Date().toISOString() : null;
  try {
    const prevRaw = await getSetting(db, STATUS_KEY);
    const prev = prevRaw ? JSON.parse(prevRaw) : null;
    if (!lastDraftAt && typeof prev?.lastDraftAt === "string") lastDraftAt = prev.lastDraftAt;
    if (prev?.today?.date === dayKey) {
      todayCreated = Number(prev.today.created) || 0;
      todayAutoSent = Number(prev.today.autoSent) || 0;
    }
  } catch {
    /* start the day's counters from zero */
  }
  const runAutoSent = result.created.filter((c) => c.autoSent).length;
  await setSetting(
    db,
    STATUS_KEY,
    JSON.stringify({
      at: new Date().toISOString(),
      account: acc.email,
      accounts,
      created: result.created.length,
      autoSent: runAutoSent,
      cleaned: result.cleaned ?? 0,
      skipped: result.skipped,
      errors: result.errors,
      pending: pendingThreads,
      lastDraftAt,
      ms: Date.now() - runStartedAt,
      today: { date: dayKey, created: todayCreated + result.created.length, autoSent: todayAutoSent + runAutoSent },
    }),
  );

  // Owner request (2026-11-10): no more "✍️ N טיוטות תשובה מחכות לך" notice mail.
  // The notice is still sent when an automatic first reply went out ("🤖 נשלח מענה אוטומטי…").
  if (result.created.some((c) => c.autoSent)) {
    const line = (c: EmailDraftRunResult["created"][number]) =>
      `<li style="margin:6px 0"><b>${c.to}</b> — ${c.summary} <span style="color:#8a6a52">(${
        c.brand === "photographer" ? "מותג צלמת" : c.brand === "studio" ? "מותג סטודיו" : "כללי"
      })</span>${c.flags?.length ? `<br><span style="color:#c23b6d">לבדוק: ${c.flags.join(" · ")}</span>` : ""}</li>`;
    const autoReplies = result.created.filter((c) => c.autoSent);
    const fresh = result.created.filter((c) => c.kind === "new");
    const fups = result.created.filter((c) => c.kind === "followup");
    try {
      await g.sendGmail({
        to: OWNER_NOTIFY,
        subject: autoReplies.length
          ? `🤖 נשלח מענה אוטומטי ל-${autoReplies.length} פניות — תעברי ותעני אישית`
          : `✍️ ${result.created.length} טיוטות תשובה מחכות לך`,
        html: `<div dir="rtl" style="font-family:Arial,sans-serif;color:#2d3d2b;max-width:560px;margin:0 auto;line-height:1.6">
          <h2 style="color:#c23b6d;margin:0 0 8px">טיוטות מוכנות בתיקיית הטיוטות</h2>
          ${
            autoReplies.length
              ? `<div style="background:#fdf1f5;border:1px solid #c23b6d;border-radius:10px;padding:10px 14px;margin:0 0 12px"><b style="color:#c23b6d">🤖 נשלח מענה ראשוני אוטומטי (עם הסתייגות שזה בוט) לפניות על סטודיו, אביזרים וצילומים:</b><ul style="padding-right:18px;margin:6px 0 0">${autoReplies.map((c) => `<li><b>${c.to}</b> — ${c.summary}</li>`).join("")}</ul><p style="margin:6px 0 0">עברי על המענה שנשלח (בתיקיית "נשלח" ובתווית "${LABEL_AUTO}"), ובדקי שהוא נכון. בכל שרשור מחכה לך גם טיוטה אישית לשליחה.</p></div>`
              : ""
          }
          <p style="margin:0 0 10px">${autoReplies.length ? "שאר הפניות — שום דבר לא נשלח." : "שום דבר לא נשלח"} — עברי, תקני אם צריך ושלחי מהג׳ימייל. השרשורים מסומנים "${LABEL_READY}".</p>
          ${fresh.length ? `<h3 style="margin:14px 0 4px">פניות חדשות</h3><ul style="padding-right:18px;margin:0">${fresh.map(line).join("")}</ul>` : ""}
          ${fups.length ? `<h3 style="margin:14px 0 4px">מעקב ללקוחות שלא חזרו</h3><ul style="padding-right:18px;margin:0">${fups.map(line).join("")}</ul>` : ""}
          <p style="margin:16px 0 0;font-size:12px;color:#8a6a52">נוצר אוטומטית מהאתר · sweetbabyphoto.shop/admin/leads</p>
        </div>`,
      });
    } catch (e) {
      console.error("[SWEETBABY] email-drafts summary mail failed", e);
    }
  }
  return result;
}

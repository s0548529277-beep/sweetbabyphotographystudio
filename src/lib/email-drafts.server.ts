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
 *
 * Cheap by design: a Gmail search every run, AI only for real new threads
 * (max MAX_NEW + MAX_FOLLOWUPS per run), runs about every 10 minutes
 * between 7:30 and 23:50 Israel time (owner request 2026-11-04), never on Shabbat. Threads already looked at are
 * remembered in app_settings (email_drafts_seen) so nothing is re-judged.
 */
import { generateTextResilient } from "./ai-gateway.server";
import { buildDraftHtml, buildDraftText, type DraftBrand, type PriceList } from "./email-draft-design";
import { chatLinkUrl } from "./orderSummary";

const MAX_NEW = 3;
const MAX_FOLLOWUPS = 2;
// Owner request 2026-11-04: a run every 10 minutes. The gap is 9 min so that an external scheduler firing every
// 10 minutes sharp (with a few seconds of jitter) never gets skipped as "too_soon". How often this actually
// runs is set by the external scheduler that calls /api/send-booking-reminders — it must call at least every 10 min.
const MIN_GAP_MS = 9 * 60_000;
// Active window (Israel time), in minutes from midnight: 07:30 – 23:50.
const WINDOW_START_MIN = 7 * 60 + 30;
const WINDOW_END_MIN = 23 * 60 + 50;
const SEEN_KEY = "email_drafts_seen";
const STATUS_KEY = "email_drafts_status";
const LAST_RUN_KEY = "email_drafts_last_run";
const PHOTOS_KEY = "email_drafts_sample_photos";
const OWNER_ADDRESSES = ["m0548529277@gmail.com", "s0548529277@gmail.com"];
const OWNER_NOTIFY = "m0548529277@gmail.com";
const LABEL_READY = "טיוטה מוכנה ✍️";
const LABEL_SENT = "נשלח ✓";
const LABEL_FOLLOW = "מעקב נשלח 🔁";
const LABEL_AUTO = "מענה ראשוני אוטומטי 🤖";
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
- מחיר: שעה ראשונה 180₪, כל שעה נוספת 100₪, חצאי שעה יחסי. מבצע ניו בורן: 3 שעות ב-320₪ (בוקר 8–11/9–12/10–13/11–14 או ערב 19–22/19:30–22:30/20–23; לא משתלב עם קופון/כרטיסייה). מצלמת Canon 5D Mark III כלולה בהשכרה.
- אביזרים בהשכרת סטודיו: כל מה שבסטודיו לשימוש חופשי; לפחות 90% מהקטלוג בסטודיו בכל רגע; שריון אביזר מסוים — אופציונלי בשלב ההזמנה. לא להבטיח מספר אביזרים.
- מועדון קאשבק: 10% קרדיט על הזמנות מ-100₪. הנחות רק דרך הרשמה לניוזלטר — לעולם לא לתת קוד.
- הזמנה: הסכם תיאום ציפיות ב-sweetbabyphoto.shop/studio-rental → בחירת מועד ב-/booking → מקדמה 90₪ (לא מוחזרת). ביום — תשלום מלא מראש. ביטול ביום עצמו — 100%.
- איחור: 15 דק׳ = חצי שעה נוספת, 45 דק׳ = שעה. נזק: תיקון/החלפה +20%. בלגן: 150₪ ניקיון.
- פרטי תשלום (רק אם שאלו איך משלמים): בנק הפועלים (12) סניף 533 חשבון 648912 על שם מיכל סיבוני · ביט 055-984-0237 · פייבוקס 055-317-3954.
- הדרכה: בסיסי חינם · MINI 50₪ · PLUS 100₪ (אין אפשרות הדרכה עם מיכל בסטודיו — מי שמבקשת צילום עם מיכל מופנית לטופס ב-sweetbabyphoto.shop/studio-photography). כרטיסיית SWEET 10+1 — בתיאום ישיר.
- הצעה לצילום בסטודיו (צד, לא חלק מהמחירון הרגיל): חבילת מיני — 2 סטים, 8 תמונות מעובדות, קולאז׳ מעוצב — 750₪. כשמישהי מבקשת צלמת בסטודיו / צילום בסטודיו, מציעים אותה: בחרי priceList="studio" והכרטיס המעוצב יתווסף אוטומטי (אל תכתבי את המחיר בטקסט). זו טיוטה בלבד — מיכל שולחת ידנית, לעולם לא נשלח אוטומטית. לא להציג אותה ללקוחות ניו בורן רגילות שמבקשות מחירון (שם priceList="newborn").
- השכרת אביזרים: 400+ אביזרים ב-sweetbabyphoto.shop/rental-catalog, מינימום 50₪, לפי 24 שעות (48 = כפול).
- יוצר קולאז׳ים חינם: sweetbabyphoto.shop/collage-maker. קשר לסטודיו: 054-8529277.`;

const WRITER_RULES = `את כותבת טיוטות תשובה למיילים בשם מיכל סיבוני. עברית חמה, אישית, בלשון נקבה (אלא אם הפונה גבר בבירור).
טון: תמיד נחמד, סבלני ומכבד — גם עם ספקים וגם כשהפונה לא סבלנית/מתלוננת: להכיר ברגש, להודות, להתנצל כשמתאים, לא להתווכח, לא להישמע קרה או מתגוננת. משפטים קצרים.
מבנה: פתיחה חמה קצרה עם השם הפרטי → תשובה ישירה לשאלה שלה → רק מידע נוסף רלוונטי (לא להעמיס) → צעד הבא אחד ברור.
קודם להבין את ההקשר: מי כותבת ולמה — לקוחה ששואלת על צילומים/סטודיו/אביזרים, או משהו אחר: מיכל מוכרת/קונה פריט (יד 2), צלמת עמיתה, ספק, שותפה (שולמית), עניין אישי. מידע על השירותים, מחירונים וכפתורים — רק ללקוחה ששאלה עליהם. לעולם לא להציע שירות שלא שאלו עליו, ולא "למכור" למי שאמרה שזה לא רלוונטי.
אם צלמת עמיתה שואלת על ההסדר/שיתוף הפעולה העסקי של מיכל (למשל עם שולמית, תמחור פנימי, אחוזים) — אל תנסחי את התשובה בעצמך: body = '[[מיכל: קולגה שואלת על ההסדר שלך — להחליט כמה לשתף ולהשיב בעצמך]]', isClient=false, needsReply=true, והוסיפי flag מתאים.
סגנון של מיכל: עברית פשוטה ויומיומית, ישירה וחמה, כמו הודעה ממנה ולא כמו פרסומת. בלי קלישאות שיווקיות ("חשוב לי מאוד ש...", "מרחב נעים", "חוויה בלתי נשכחת"), בלי הסברים מיותרים ובלי לחזור על עצמך.
עובדות: רק מהידע למטה או מתשובות קודמות של מיכל (כשיש סתירה — התשובה האחרונה של מיכל קובעת). אסור להמציא מחירים, תאריכים, זמינות או הבטחות. משהו לא ידוע → "אבדוק ואחזור אלייך בהקדם" + flag למיכל. זמינות — "אבדוק ואאשר". דבר שדורש החלטה של מיכל → [[מיכל: ...]] בטקסט + flag. לעולם לא קוד קופון. לעולם לא להעתיק פרטים של לקוחה אחת לאחרת.
עיצוב הטקסט (body): פסקאות מופרדות בשורה ריקה; רשימה = שורות שמתחילות ב-"- "; כותרת קטנה = "## כותרת"; תיבה מודגשת = שורות שמתחילות ב-"> "; **מודגש**. בלי HTML, בלי חתימה (נוספת אוטומטית), בלי קישורי תמונות. אימוג׳י רק 💗 או ✨ ובמשורה.
איכות: לענות על כל שאלה שנשאלה בשרשור (לא רק האחרונה), לשקף פרט אחד ספציפי שהלקוחה כתבה כדי שירגיש אישי, לא לחזור על מה שמיכל כבר כתבה בשרשור, לסיים בשאלה/הזמנה אחת קונקרטית (למשל "איזה תאריך נוח לך?"). אורך לפי ההודעה שקיבלנו: הודעה קצרה או שאלה אחת → 1–3 משפטים קצרים. פנייה ראשונה של לקוחה עם כמה שאלות → עד 120 מילים. רק כשהשאלה באמת מורכבת — יותר. נושא (subject) קצר וברור בעברית, "Re:" רק בתשובה לשרשור קיים.
כשלקוחה חדשה שואלת על צילומי ניו בורן רגילים (לא סל לידה) בלי לפרט — לשאול בתשובה כמה סטים היא רוצה והאם עם אלבום או בלי, ואם אפשר להבין מההודעה מה יתאים לה — להמליץ חבילה אחת במשפט קצר.
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

async function analyze(subject: string, text: string, past: string, isSiteForm: boolean, freeDates = ""): Promise<Analysis | null> {
  const { text: out } = await generateTextResilient(
    {
      system: WRITER_RULES,
      prompt: `${isSiteForm ? "זו הודעה מטופס יצירת הקשר באתר של מיכל — פרטי הלקוחה (שם/טלפון/אימייל/שאלה) בגוף ההודעה. התשובה תישלח כמייל חדש לכתובת של הלקוחה. אם יש רק שם ואימייל בלי שאלה — טיוטה קצרה וחמה של 'תודה, איך אפשר לעזור' + מידע עיקרי, במותג photographer.\n\n" : ""}נושא: ${subject}\n\nהשרשור (ההודעה האחרונה בסוף):\n${text}\n\n${past ? `תשובות קודמות של מיכל בנושא דומה (להעדיף את הניסוח והעובדות שלה):\n${past}\n\n` : ""}${freeDates ? `מועדים פנויים אמיתיים בסטודיו כרגע (מהיומן): \n${freeDates}\nכשהפונה שואלת על השכרת הסטודיו / תאריך / זמינות ואין לה תאריך מדויק, או שהתאריך שביקשה לא מתאים — הציעי בגוף המייל 2–3 מהמועדים האלה (בניסוח "נכון לעכשיו פנוי", בלי להבטיח — השריון נקבע בהזמנה) והציבי cta="booking" כדי שיופיע קישור לשריון. אם היא ביקשה תאריך מסוים — ענו על התאריך שלה קודם. אל תציעי מועדים כשהשאלה לא קשורה לסטודיו.\n\n` : ""}החזירי JSON בלבד (בלי טקסט נוסף):
{"needsReply": true/false — false לניוזלטר/פרסומת/קבוצה/הודעה אוטומטית/קבלה/משהו שלא מחכה לתשובה של מיכל. false גם כשההודעה האחרונה סוגרת את השיחה ולא שואלת כלום (\"תודה\", \"לא רלוונטי לי, תודה בכל אופן\", \"אוקיי\", \"מעולה\", 👍),
"brand": "photographer" (צילומים של מיכל, סל לידה, חבילות, גלריה, אלבומים) | "studio" (השכרת סטודיו, אביזרים, קולאז׳, חוקי הסטודיו) | "general" (ספקים, שותפים, כל השאר),
"topic": "newborn"|"birth_basket"|"upsherin"|"family"|"outdoor"|"studio"|"props"|"other",
"isClient": true/false,
"clientName": "שם פרטי", "clientEmail": "", "clientPhone": "",
"question": "שורה קצרה: מה היא שאלה",
"priceList": "newborn"|"outdoor"|"both"|"studio"|"none" — רק אם שאלו על מחירים/חבילות ובמותג photographer; "studio" כשמבקשים צלמת בסטודיו / צילום בסטודיו עם מיכל (ראי הנחיה בידע),
"photos": "newborn"|"family"|"none" — תמונות לדוגמה בראש המייל (רק photographer ורק ללקוחה ששואלת על צילומים),
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

export async function runEmailDraftAssistant(opts: { force?: boolean } = {}): Promise<EmailDraftRunResult> {
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
    if (last && Date.now() - Date.parse(last) < MIN_GAP_MS) return { ...result, reason: "too_soon" };
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
  const remember = (id: string) => {
    if (!seenSet.has(id)) {
      seenSet.add(id);
      seen.ids.push(id);
    }
  };

  let photos: { newborn: string[]; family: string[] } = { newborn: [], family: [] };
  try {
    photos = { ...photos, ...JSON.parse((await getSetting(db, PHOTOS_KEY)) || "{}") };
  } catch {
    /* no sample photos */
  }

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
    }
    // Any open draft in a thread — made here, by Claude chat or by her — means
    // "someone is already on it": never add a second draft to that thread.
    const draftThreads = new Set(liveDrafts.map((d) => d.message?.threadId).filter(Boolean) as string[]);

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
    const threadIds = [...newestByThread.entries()]
      .filter(([t, mid]) => !seenSet.has(mid) && !draftThreads.has(t))
      .map(([t]) => t);

    let made = 0;
    let autoRun = 0;
    let freeDates: string | null = null;
    const autoDay = await loadAutoDay(db);
    const autoLabelId = labels.get(LABEL_AUTO);
    for (const threadId of threadIds) {
      if (made >= MAX_NEW) break;
      const th = await g.gmailApi<{ messages?: any[] }>(k, `/users/me/threads/${threadId}?format=full`);
      const msgs = th?.messages ?? [];
      const last = msgs[msgs.length - 1];
      if (!last) continue;
      const seenId: string = last.id;
      const h = last.payload?.headers;
      const from = g.gmailHeaderValue(h, "From");
      const fromAddr = addrOf(from);
      const isSiteForm = fromAddr.endsWith(SITE_FORM_SENDER);
      const autoSubmitted = (g.gmailHeaderValue(h, "Auto-Submitted") || "no").toLowerCase();
      const auto =
        /no-?reply|mailer-daemon|notification|newsletter|bounce/i.test(fromAddr) ||
        (!!g.gmailHeaderValue(h, "List-Id") && !isSiteForm) ||
        autoSubmitted !== "no";
      if (isOwner(fromAddr) || auto) {
        remember(seenId);
        result.skipped++;
        continue;
      }
      const subject = g.gmailHeaderValue(h, "Subject") || "";
      const text = threadText(g, msgs);
      let a: Analysis | null = null;
      try {
        if (freeDates === null && STUDIO_DATE_HINT.test(`${subject}\n${text}`)) freeDates = await freeDatesBlock();
        a = await analyze(subject, text, await pastAnswers(g, k, `${subject}\n${text}`), isSiteForm, STUDIO_DATE_HINT.test(`${subject}\n${text}`) ? freeDates ?? "" : "");
      } catch (e: any) {
        result.errors.push(`AI: ${String(e?.message ?? e).slice(0, 120)}`);
        break; // AI down — try again next run, don't mark as seen
      }
      if (!a) {
        result.errors.push("AI returned no JSON");
        continue;
      }
      if (!a.needsReply || !a.body?.trim()) {
        remember(seenId);
        result.skipped++;
        continue;
      }

      let to = from;
      let replyHeaders: { threadId?: string; inReplyTo?: string; references?: string } = {
        threadId,
        inReplyTo: g.gmailHeaderValue(h, "Message-ID") || g.gmailHeaderValue(h, "Message-Id"),
        references: [g.gmailHeaderValue(h, "References"), g.gmailHeaderValue(h, "Message-ID")].filter(Boolean).join(" "),
      };
      let draftSubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
      if (isSiteForm) {
        const email = (a.clientEmail || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          remember(seenId);
          result.errors.push(`טופס מהאתר בלי אימייל תקין (${a.clientName || "?"})`);
          continue;
        }
        // Already answered her (or a draft to her exists)?
        const sentTo = await g.searchGmail(`in:sent to:${email} newer_than:3d`, 1, k);
        const draftTo = await g.searchGmail(`in:draft to:${email}`, 1, k);
        if (sentTo.length || draftTo.length) {
          remember(seenId);
          result.skipped++;
          continue;
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
        if (autoSent) {
          autoRun++;
          autoDay.count++;
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
      const photoSet = a.photos === "newborn" ? photos.newborn : a.photos === "family" ? photos.family : [];
      const html = buildDraftHtml({
        brand,
        body: a.body,
        priceList: a.priceList,
        photos: a.bigPhotos ? photoSet : photoSet.slice(0, 4),
        bigPhotos: !!a.bigPhotos,
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
        continue;
      }
      if (readyId) {
        await g.gmailApi(k, `/users/me/threads/${threadId}/modify`, { method: "POST", body: { addLabelIds: [readyId] } });
      }
      remember(seenId);
      made++;
      result.created.push({ to: addrOf(to), summary: a.summary, brand, kind: "new", flags: a.flags, autoSent });
      if (a.isClient) {
        await upsertLead(db, {
          name: a.clientName || nameOf(from) || null,
          email: isSiteForm ? to : fromAddr,
          phone: a.clientPhone || null,
          source: isSiteForm ? "site_form" : "email",
          topic: a.topic || "other",
          message: a.question || a.summary,
          status: "new",
          gmail_thread_id: threadId,
          // Marks "draft ready, not sent yet" for /admin/leads (status stays
          // "new" until she actually answers).
          notes: `${autoSent ? `${AUTO_REPLY_NOTE}. ` : ""}${DRAFT_READY_NOTE} ${new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}`,
        });
      }
    }

    // ---------- follow-ups for clients who went quiet ----------
    if (!result.errors.some((e) => e.startsWith("AI"))) {
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
        if (fu >= MAX_FOLLOWUPS) break;
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
  try {
    const prevRaw = await getSetting(db, STATUS_KEY);
    const prev = prevRaw ? JSON.parse(prevRaw) : null;
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
      today: { date: dayKey, created: todayCreated + result.created.length, autoSent: todayAutoSent + runAutoSent },
    }),
  );

  if (result.created.length) {
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

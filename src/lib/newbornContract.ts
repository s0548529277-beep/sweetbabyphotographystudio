import michalWordmark from "@/assets/michal-logo-wordmark.png";

/**
 * The combined "הכנה ליום הצילומים" document — prep guide (what to bring)
 * + the full legal contract, replacing the two previously-separate/shorter
 * pieces (the old buildNewbornContractHtml in this file's neighbor, and
 * photoContract.ts's fuller-but-unused-here version). Per explicit request:
 * admin-editable as ONE plain-text box (app_settings, key
 * NEWBORN_CONTRACT_TEMPLATE_KEY — see admin.newborn-contract-text.tsx),
 * not raw HTML — so editing it can never break the page's markup.
 *
 * Format (deliberately simple, so a non-technical edit is always safe):
 * - A line starting with "## " starts a new section (its own heading).
 * - Blank lines separate paragraphs within a section.
 * - A block whose every line starts with "- " renders as a bullet list.
 * - {{token}} placeholders are substituted before parsing — see
 *   NewbornContractVars below for the exact set.
 */

const WORDMARK_URL = `https://sweetbabyphoto.shop${michalWordmark}`;
const ROSE = "#c23b6d";
const BROWN = "#5a4433";
const BROWN_SOFT = "#8a6a52";
const CREAM = "#f6f0e4";
const BORDER = "#a9784f";

export const NEWBORN_CONTRACT_TEMPLATE_KEY = "newborn_contract_template";

export type NewbornContractVars = {
  contact_name: string;
  package_line: string;
  price_line: string;
  extra_photo_price: string;
  session_date_line: string;
  session_time_line: string;
  confirm_link: string;
};

export const DEFAULT_NEWBORN_CONTRACT_TEMPLATE = `היי {{contact_name}} היקרה,
שמחה ומתרגשת שבחרת בי לקחת חלק ולתעד את המשפחה שלכם ברגעים מרגשים אלו.

## ביגוד ואקססוריז
3 סטים לבייבי — האיבזור וההלבשה עליי :)

צילומי הורים:
אמא — שמלה חלקה, בצבע אחיד.
אבא — סריג תואם אם יש; אם לא, אפשר גם חולצה לבנה או וסט.
טיפ: טבעות וצמידים לאמא מוסיפים המון לתקריבי ידיים, ושעון לאבא.

אחים — צבע אחיד לכל האחים, עדיף גוון בהיר וטבעי.

## לבייבי — הכנות ליום הצילום
- לקלח את הבייבי בבוקר הצילומים
- בקבוק של חלב שאוב / תמ"ל
- מוצץ
- שמיכה חמה
- טיטולים בשפע ומגבונים — לא לשכוח!

## אמא
תכיני את עצמך באופן מנטלי — צילומי ניו-בורן דורשים הרבה סבלנות :)
חשוב להגיע עם הבייבי שבע ורגוע.

## צילומי משפחה — סדר היום
את הסט המשפחתי נעשה ראשון, ולאחר מכן הילדים והאבא ישאירו אותנו עם הבייבי להמשך הצילומים.
משך הצילומים: 2.5–4 שעות.

## קריאת ההסכם למטה — חובה!
נא לקרוא את כל ההסכם בעיון לפני הגעה לצילומים, ולאשר בקישור בסוף המייל.

## הסכם התקשרות
היי יקרה, שמחה ומתרגשת שבחרת בי לקחת חלק ולתעד את המשפחה שלכם ברגעים מרגשים אלו.

## סטיילינג
כדי שהתמונות והסטיילינג יהיו מדויקים ויפים, חשוב לי שהבגדים יהיו תואמים לאופי הסשן — ולכן אשמח לקחת חלק בבחירת הבגדים. לפני בחירה או קנייה, ניתן לשלוח תמונה ולהתייעץ. לביבי — כל הביגוד והעיטופים עליי :)

## צילומים עם אחים
יש להגיע מוכנים, ולהצטייד ביום הצילום ב: מים, אוכל לא מלכלך, ממתקים מתגמלים למצולמים, מברשת שיער, גומיות, מגבונים, גרביים ונעליים להחלפה (במידה ומצטלמים באמבטיה — מגבת רכה). מומלץ להגיע ערניים ורגועים על מנת שיהיו תוצאות מדויקות.

## הגעה ליום הצילומים
זמן הצילומים משתנה בין תינוק לתינוק ובין ילד לילד — כל סט אורך בין 20–60 דקות, ולכן יש להיערך לכך לפי החבילה ומספר הסטים שנקבעו. בחלל הסטודיו קיים ציוד בשווי עשרות אלפי שקלים — יש לנהוג בזהירות ולשמור על הילדים כדי שחלילה לא ייגרם נזק.

## פרטי החבילה
{{package_line}}
{{price_line}}
עיבוד תמונה נוספת מעבר לחבילה — בתשלום של {{extra_photo_price}} ש"ח.

## מקדמה
לשריון התאריך יש להעביר מקדמה על סך 300 ש"ח.
פרטי חשבון להעברה: בנק 12, סניף 533, חשבון 648912, על שם מיכל סיבוני.
במקרה של ביטול הצילומים על ידי הלקוחה — הביטול אינו מזכה בהחזר המקדמה.

## אופן התשלום
שאר התשלום ישולם במלואו, במזומן או בהעברה, ביום הצילומים מיד בסיום. תמונות לבחירה יישלחו רק לאחר תשלום מלא על החבילה.

## מועד ושעת הצילום
{{session_date_line}}
{{session_time_line}}
יש להגיע 10 דקות קודם לפני הזמן שקבענו.

## בטיחות ואחריות
יש לציין שאחריות ובטיחות הילדים מוטלת על ההורים בלבד!

## דיוק בזמנים ואיחורים
למען הצלחת הצילומים, למענך ולמעני, יש לדייק ולהגיע בזמן. איחור עשוי לקצר את משך זמן הצילום ולהביא לפחות תוצאות. במידת הצורך (איחור משמעותי שיגרום לחוסר הספקה), הצלמת תציע ללקוחה יום צילומים נוסף בעלות של 600 ש"ח.

## שיתוף פעולה
שיתוף הפעולה שלכם, ההורים, חשוב מאוד! מומלץ להביא ממתקים שהילדים אוהבים ולשים אצלי מאחורי, תוך כדי הצילומים.

## אחרי הצילומים — זמני הספקה ותהליך בחירה
תמונות לבחירה יישלחו ביום שלאחר הצילומים, דרך גלריה מקוונת — תוקף הצפייה שבוע מיום קבלת הקישור. זמן בחירת התמונות הוא שבוע מיום קבלתן. האלבום יהיה מוכן תוך 60 ימי עסקים לאחר בחירת התמונות, בתנאי שהבחירה בוצעה בזמן (שבוע מהצילומים, לא כולל שבתות וחגים).

## איחורים בבחירת התמונות
יש לבחור תמונות תוך שבוע מיום שליחתן. לקוחות שמתעכבות בבחירת התמונות מעל לשבועיים — אין לי מחויבות להשלים ולתת את האלבום בזמנים המקוריים. לאחר חודש מיום קבלת התמונות הן מועברות לגיבוי בלבד, ולא תהיה עליי אחריות עליהן.

## עריכות, תיקונים ושינויים
לאחר העריכה אין אפשרות להחליף תמונות. עריכת התמונות נועדה להוסיף אווירה וקסם — אין בעריכה שינויי מציאות (הארכת חצאית, סידור בגד וכו'). תיקון מציאות הוא עריכה גרפית — במידה והלקוחה רוצה, הוא נשלח לגרפיקאית מקצועית, בעלות נוספת של 15 ש"ח. תמונה שתבוטל לאחר העריכה תחויב בתשלום מלא.

## תיקונים בעיצוב האלבום
ניתן לשלוח פעם אחת עד 4 תיקונים בעיצוב. כל תיקון נוסף — בעלות של 60 ש"ח. במידה ויש צורך בתמונה מעובדת מוקדם לצורך הדפסה לאירוע, יש להודיע מראש — התמונה הנבחרת תעובד תוך 5 ימי עסקים.

## זכויות שימוש
התמונות נשמרות בתיקיית העבודות שלי ובקטלוג — אם אינכם מעוניינים בכך, יש להודיע על כך מראש. זכויות היוצרים על התמונות שייכות לצלמת. ללקוח יש זכות שימוש אישית, ולא למטרות מסחריות.

## אישור
לחיצה על הקישור למטה מהווה אישור שקראת את ההסכם במלואו ומסכימה לתנאיו — זו החתימה הדיגיטלית שלך:
{{confirm_link}}

מחכה ממש לתעד לכם רגעים מרגשים :)
מיכל`;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Renders one section's plain-text body into paragraphs/bullet lists — the only markup this template format supports. */
function renderBody(bodyText: string): string {
  const blocks = bodyText
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const isList = lines.length > 0 && lines.every((l) => l.startsWith("- "));
      if (isList) {
        const items = lines
          .map((l) => `<li style="margin:2px 0">${escapeHtml(l.slice(2))}</li>`)
          .join("");
        return `<ul style="margin:6px 0;padding-inline-start:20px">${items}</ul>`;
      }
      return `<p style="margin:6px 0">${lines.map(escapeHtml).join("<br/>")}</p>`;
    })
    .join("");
}

/** Substitutes every {{token}} in the template with its value from vars (missing tokens are left as-is, visibly, so a typo'd token is easy to spot rather than silently vanishing). */
export function fillNewbornContractPlaceholders(
  template: string,
  vars: NewbornContractVars,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    return value !== undefined ? value : match;
  });
}

/**
 * Parses the (already placeholder-filled) template text into the final
 * branded email HTML — same rose/brown/cream palette and heart-divider
 * section styling as photoContract.ts, kept email-safe (inline styles
 * only, system font stack — no external fonts/stylesheets, which most
 * email clients strip anyway).
 */
export function renderNewbornContractHtml(filledTemplate: string): string {
  const rawSections = filledTemplate.split(/\n##\s+/);
  const intro = rawSections[0]?.trim() ?? "";
  const sections = rawSections.slice(1).map((raw) => {
    const newlineIdx = raw.indexOf("\n");
    const title = (newlineIdx === -1 ? raw : raw.slice(0, newlineIdx)).trim();
    const body = newlineIdx === -1 ? "" : raw.slice(newlineIdx + 1).trim();
    return { title, body };
  });

  const sectionHtml = sections
    .map(
      (s) => `
    <tr><td style="padding:22px 0 0">
      <h3 style="margin:0 0 8px;color:${ROSE};font-size:17px;font-weight:bold">${escapeHtml(s.title)}</h3>
      <div style="color:${BROWN};font-size:14px;line-height:1.9">${renderBody(s.body)}</div>
    </td></tr>
    <tr><td style="padding:16px 0 0">
      <div style="border-top:1px solid ${BORDER}55;position:relative;text-align:center">
        <span style="position:relative;top:-9px;background:${CREAM};padding:0 10px;color:${ROSE};font-size:12px">♥</span>
      </div>
    </td></tr>`,
    )
    .join("");

  return `<div dir="rtl" style="font-family:Arial,sans-serif;color:${BROWN};max-width:600px;margin:0 auto">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BORDER};padding:14px 0">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${CREAM};border-radius:4px">
          <tr><td style="padding:34px 34px 10px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:18px">
              <img src="${WORDMARK_URL}" alt="Michal" height="46" style="height:46px;width:auto" />
            </td></tr></table>
            <h2 style="margin:0 0 10px;color:${ROSE};font-size:22px;text-align:center">הכנה ליום הצילומים</h2>
            <div style="color:${BROWN};font-size:14px;line-height:1.9">${renderBody(intro)}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sectionHtml}</table>
            <p style="margin-top:20px;color:${BROWN_SOFT};font-size:13px;text-align:center">כתובת הסטודיו: תלמוד ירושלמי 24, בית שמש</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}

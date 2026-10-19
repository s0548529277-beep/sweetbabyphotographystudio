import michalWordmark from "@/assets/michal-logo-wordmark.png";

/**
 * The "תיאום ציפיות" contract for צילומי חוץ (outdoor/location) package
 * clients — same visual structure and most of the same clauses as
 * photoContract.ts's buildPhotoContractHtml (studio/bookings flow), plus
 * the location-cost section and the >1-sibling separation rule this track
 * needs. Deliberately a SEPARATE file/function rather than editing
 * photoContract.ts: that one is already live on the existing
 * admin.photo-clients.$bookingId.tsx "שליחת חוזה" flow, and this track
 * (admin.outdoor-packages.tsx, not tied to a `bookings` row) has its own
 * dynamic fields — only the package details, session date and session
 * time ever change per client, per explicit instruction; everything else
 * is fixed wording.
 */

const WORDMARK_URL = `https://sweetbabyphoto.shop${michalWordmark}`;

const STUDIO_ADDRESS = "תלמוד ירושלמי 24, ד׳3, בית שמש";
const STUDIO_EMAIL = "s0548529277@gmail.com";

const ROSE = "#c23b6d";
const BROWN = "#5a4433";
const BROWN_SOFT = "#8a6a52";
const CREAM = "#f6f0e4";
const BORDER = "#a9784f";

export type OutdoorContractInput = {
  contactName: string;
  /** YYYY-MM-DD */
  sessionDate: string;
  /** HH:MM, optional — the exact-time line is skipped if not set */
  sessionTime: string | null;
  packageName: string | null;
  /** Free-text package inclusions (e.g. "4 סטים שמתוכם 2 סט משפחתי 2 סט אחים · 25 תמונות מעובדות · אלבום...") */
  packageDescription: string | null;
  totalPrice: number | null;
  /** Deposit amount required to hold the date — same studio-wide amount unless told otherwise. */
  depositAmount?: number;
};

function heDateLine(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const weekday = d.toLocaleDateString("he-IL", { weekday: "long" });
  const dm = d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${weekday} בתאריך ${dm}`;
}

function section(title: string, bodyHtml: string): string {
  return `
    <tr><td style="padding:22px 0 0">
      <h3 style="margin:0 0 8px;color:${ROSE};font-size:17px;font-weight:bold">${title}</h3>
      <div style="color:${BROWN};font-size:14px;line-height:1.9">${bodyHtml}</div>
    </td></tr>
    <tr><td style="padding:16px 0 0">
      <div style="border-top:1px solid ${BORDER}55;position:relative;text-align:center">
        <span style="position:relative;top:-9px;background:${CREAM};padding:0 10px;color:${ROSE};font-size:12px">♥</span>
      </div>
    </td></tr>`;
}

/** Builds the full "תיאום ציפיות" contract email HTML for one outdoor-package client. */
export function buildOutdoorContractHtml(input: OutdoorContractInput): string {
  const {
    contactName,
    sessionDate,
    sessionTime,
    packageName,
    packageDescription,
    totalPrice,
    depositAmount = 300,
  } = input;

  const timeLine = sessionTime
    ? `<p style="margin:4px 0">זמן הצילום יתחיל בשעה <strong dir="ltr">${sessionTime}</strong></p>`
    : "";

  const packageLine = packageName
    ? `סגרנו על ${packageName}${packageDescription ? ` שכוללת: ${packageDescription}` : ""}`
    : "פרטי החבילה יימסרו בנפרד";
  const priceLine = totalPrice != null ? `בסך ${totalPrice} ש״ח` : "";

  const body = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BORDER};padding:14px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${CREAM};border-radius:4px">
        <tr><td style="padding:34px 34px 10px">

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:18px">
            <img src="${WORDMARK_URL}" alt="Michal" height="46" style="height:46px;width:auto" />
          </td></tr></table>

          <p style="margin:0 0 10px;color:${BROWN_SOFT};font-size:11px;letter-spacing:0.08em">תיאום ציפיות</p>
          <p style="margin:0 0 4px;color:${ROSE};font-size:19px;font-weight:bold">הי ${contactName || "יקרה"},</p>
          <p style="margin:0 0 4px;color:${BROWN};font-size:14px;line-height:1.8">
            שמחה ומתרגשת שבחרת בי לקחת חלק ולתעד את המשפחה שלכם ברגעים מרגשים אלו 💗
          </p>
          <p style="margin:8px 0 4px;color:${BROWN};font-size:14px;line-height:1.8">
            אשמח לקבל תמונה של בני המשפחה כדי להתרשם מהסגנון ולתכנן איתך את הצילומים בצורה הכי מדויקת.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${section(
              "סטייילינג",
              `<p style="margin:4px 0">כדי שהתמונות והסטיילינג יהיו מדויקים ויפים, חשוב לי שהבגדים יהיו תואמים לאופי הסשן — ולכן אשמח לקחת חלק בבחירת הבגדים. לפני בחירה או קנייה, ניתן לשלוח תמונה ולהתייעץ.</p>`,
            )}

            ${section(
              "הוצאות חיצוניות – לוקיישן ואביזרים",
              `<p style="margin:4px 0">צילומים בלוקיישן שעולה תשלום (חוות סוסים, שמורת טבע, רכב אספנות וכו׳) הם על חשבון הלקוחה.</p>
               <p style="margin:4px 0">כמו כן אביזרים מתכלים כמו אוכל לצילום, פירות, בלונים וכו׳.</p>`,
            )}

            ${section(
              "הגעה ליום הצילומים",
              `<p style="margin:4px 0">כדי שהחוויה שלך, אמא, תהיה איכותית וטובה ושתצליחי ליהנות מהרגעים — במידה ואתם משפחה מעל 3 ילדים, חוץ מהמצולם הראשי, יום הצילומים יתנהל בהפרדה: במהלך הצילומים יהיה איתנו הילד המצולם, ורק בסט המשפחתי שאר המשפחה תצטרף ותגיע ברכב בנפרד.</p>`,
            )}

            ${section(
              "סעיף לצילומי ניו בורן",
              `<p style="margin:4px 0">את הסט המשפחתי נעשה ראשון, ולאחר מכן הילדים והאבא ישאירו אותנו עם הבייבי להמשך הצילומים.</p>`,
            )}

            ${section(
              "פרטי החבילה",
              `<p style="margin:4px 0">${packageLine}${priceLine ? `, ${priceLine}` : ""}.</p>`,
            )}

            ${section(
              "מקדמה",
              `<p style="margin:4px 0">לשריון תאריך יש להעביר מקדמה ע״ס ${depositAmount} ש״ח.</p>
               <p style="margin:4px 0">פרטי חשבון להעברה: בנק 12 · סניף 533 · חשבון 648912 · על שם מיכל סיבוני.</p>
               <p style="margin:4px 0">במקרה של ביטול הצילומים ע״י הלקוחה — הביטול אינו מזכה בהחזר המקדמה.</p>`,
            )}

            ${section(
              "אופן התשלום",
              `<p style="margin:4px 0">שאר התשלום ישולם במלואו במזומן או בהעברה ביום הצילומים, מיד בסיומם.</p>
               <p style="margin:4px 0">תמונות לבחירה יישלחו רק לאחר תשלום מלא על החבילה.</p>`,
            )}

            ${section(
              "מועד ושעת הצילום",
              `<p style="margin:4px 0">הצילומים יתקיימו בעז״ה ב${heDateLine(sessionDate)}</p>
               ${timeLine}
               <p style="margin:4px 0">יש להגיע 10 דקות קודם לזמן שקבענו</p>`,
            )}

            ${section(
              "בטיחות ואחריות",
              `<p style="margin:4px 0">יש לציין שאחריות ובטיחות הילדים מוטלת על ההורים בלבד!</p>`,
            )}

            ${section(
              "דיוק בזמנים ואיחורים",
              `<p style="margin:4px 0">למען הצלחת הצילומים, למענך ולמעני, יש לדייק ולהגיע בזמן. איחור עשוי לקצר את משך זמן הצילום ולהביא לפחות תוצרים.</p>
               <p style="margin:4px 0">במידת הצורך (איחור משמעותי שיגרום לחוסר הספקה), הצלמת תציע ללקוחה יום צילומים נוסף בעלות של 600 ש״ח.</p>`,
            )}

            ${section(
              "שיתוף פעולה",
              `<p style="margin:4px 0">שיתוף הפעולה שלכם, ההורים, חשוב מאוד! מומלץ להביא ממתקים שהילדים אוהבים ולשים אצלי מאחורי, תוך כדי הצילומים.</p>`,
            )}

            ${section(
              "אחרי הצילומים — זמני הספקה ותהליך בחירה",
              `<p style="margin:4px 0">תמונות לבחירה יישלחו ביום שלאחר הצילומים, דרך גלריה מקוונת — תוקף הצפייה שבוע מיום קבלת הקישור.</p>
               <p style="margin:4px 0">זמן בחירת התמונות הוא שבוע מיום קבלתן.</p>
               <p style="margin:4px 0">האלבום יהיה מוכן תוך 60 ימי עסקים לאחר בחירת התמונות, בתנאי שהבחירה בוצעה בזמן (שבוע מהצילומים, לא כולל שבתות וחגים).</p>`,
            )}

            ${section(
              "איחורים בבחירת התמונות",
              `<p style="margin:4px 0">יש לבחור תמונות תוך שבוע מיום שליחתן. לקוחות שמתעכבות בבחירת התמונות מעל לשבועיים — אין לי מחויבות להשלים ולתת את האלבום בזמנים המקוריים.</p>
               <p style="margin:4px 0">לאחר חודש מיום קבלת התמונות הן מועברות לגיבוי בלבד, ולא תהיה עליי אחריות עליהן.</p>`,
            )}

            ${section(
              "עריכות, תיקונים ושינויים",
              `<p style="margin:4px 0">לאחר העריכה אין אפשרות להחליף תמונות. עריכת התמונות נועדה להוסיף אווירה וקסם — אין בעריכה שינויי מציאות (הארכת חצאית, סידור בגד וכו׳).</p>
               <p style="margin:4px 0">תיקון מציאות הוא עריכה גרפית — במידה והלקוחה רוצה, הוא נשלח לגרפיקאית מקצועית. כל תיקון כזה בעלות נוספת של 15 ש״ח.</p>
               <p style="margin:4px 0">תמונה שתבוטל לאחר העריכה תחויב בתשלום מלא.</p>`,
            )}

            ${section(
              "תיקונים בעיצוב האלבום",
              `<p style="margin:4px 0">ניתן לשלוח פעם אחת עד 4 תיקונים בעיצוב. כל תיקון נוסף — בעלות של 60 ש״ח.</p>
               <p style="margin:4px 0">במידה ויש צורך בתמונה מעובדת מוקדם לצורך הדפסה לאירוע, יש להודיע מראש. התמונה הנבחרת תעובד תוך 5 ימי עסקים.</p>`,
            )}

            ${section(
              "זכויות שימוש",
              `<p style="margin:4px 0">התמונות נשמרות בתיקיית העבודות שלי ובקטלוג — אם אינכם מעוניינים בכך, יש להודיע על כך מראש.</p>
               <p style="margin:4px 0">זכויות היוצרים על התמונות שייכות לצלמת. ללקוח יש זכות שימוש אישית, ולא למטרות מסחריות.</p>`,
            )}

            ${section(
              "דגשים לצילומי סטודיו וצילומי ניו בורן",
              `<p style="margin:4px 0">זמן הצילומים משתנה בין תינוק לתינוק ובין ילד לילד — כל סט אורך בין 20–60 דקות, ולכן יש להיערך לכך לפי החבילה ומספר הסטים שנקבעו.</p>
               <p style="margin:4px 0">• במידה ויש יותר מאח אחד למצולם — למען שמירת הסדר וההספקים בזמן הצילום, רק האמא והילד נשארים בסטודיו; רק בזמן צילומי המשפחה האחים וההורים יכולים להגיע ולהצטרף לצילומים.</p>
               <p style="margin:4px 0">• בצילומי ניו בורן — רק האמא והתינוק והצלמת נשארים לאורך כל הסשנים, ללא אחים כלל!</p>
               <p style="margin:4px 0">• שמירה על רכוש — בחלל הסטודיו קיים ציוד בשווי עשרות אלפי שקלים; יש לנהוג בזהירות ולשמור על הילדים כדי שחלילה לא ייגרם נזק.</p>`,
            )}

            <tr><td style="padding:22px 0 0">
              <h3 style="margin:0 0 8px;color:${ROSE};font-size:17px;font-weight:bold">אישור</h3>
              <div style="color:${BROWN};font-size:14px;line-height:1.9">
                <p style="margin:4px 0">יש להשיב למייל זה (<a href="mailto:${STUDIO_EMAIL}" style="color:${ROSE}">${STUDIO_EMAIL}</a>) עם המשפט:</p>
                <p style="margin:4px 0">״שמי (${contactName || "___"}) קראתי את הכתוב בהסכם זה, ואני מאשר/ת את הדברים״ — וחתימה (דיגיטלית).</p>
              </div>
            </td></tr>

          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:26px">
            <tr><td align="center">
              <p style="margin:0 0 4px;color:${ROSE};font-size:15px;font-weight:bold">מחכה להיפגש איתכם בסטודיו שלי —</p>
              <p style="margin:0 0 4px;color:${BROWN_SOFT};font-size:13px">${STUDIO_ADDRESS}</p>
              <p style="margin:0 0 4px;color:${BROWN};font-size:14px">ולצלם לכם תמונות חלומיות ✨</p>
              <p style="margin:0 0 14px;color:${BROWN};font-size:14px">שיהיה בהצלחה, באירגונים ובסייעתא דשמיא</p>
              <img src="${WORDMARK_URL}" alt="Michal" height="34" style="height:34px;width:auto" />
            </td></tr>
          </table>

        </td></tr>
      </table>
    </td></tr>
  </table>`;

  return body;
}

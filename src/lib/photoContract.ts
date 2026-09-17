import michalWordmark from "@/assets/michal-logo-wordmark.png";

/**
 * The studio's real photo-session contract — the fixed terms Michal already
 * sends every client who closes a booking (previously assembled and sent by
 * hand each time from a saved document, only the date/time/package details
 * changed per client). Transcribed from that document; wording kept as
 * close to her original as possible on purpose — this is the contract
 * clients agree to, not a place to rewrite her phrasing.
 *
 * Used by sendPhotoClientContract (photo-clients.functions.ts), triggered
 * from a "שליחת חוזה" button on the client's workflow page
 * (admin.photo-clients.$bookingId.tsx) — NOT sent automatically on deposit
 * confirmation, since package details (photo count, price, extras) aren't
 * knowable until the admin has actually filled them in for that client.
 */

// Absolute URL — email clients can't resolve relative/build-hashed paths.
const WORDMARK_URL = `https://sweetbabyphoto.shop${michalWordmark}`;

const STUDIO_ADDRESS = "תלמוד ירושלמי 24, ד׳3, בית שמש";
const STUDIO_EMAIL = "s0548529277@gmail.com";

const ROSE = "#c23b6d";
const BROWN = "#5a4433";
const BROWN_SOFT = "#8a6a52";
const CREAM = "#f6f0e4";
const BORDER = "#a9784f";

export type PhotoContractInput = {
  contactName: string;
  /** YYYY-MM-DD */
  sessionDate: string;
  /** HH:MM, optional — the arrival-time line is skipped if not set */
  sessionTime: string | null;
  photosToEdit: number | null;
  totalPrice: number | null;
  /** Free-text extras (e.g. "4 סטים", "כריכת זכוכית") — appended to the package line as written. */
  albumUpgrades: string | null;
  /** Price for one additional edited photo beyond the package — same studio-wide rate unless told otherwise for this client. */
  extraPhotoPrice?: number;
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

/** Builds the full contract email HTML, filled in for one specific client/booking. */
export function buildPhotoContractHtml(input: PhotoContractInput): string {
  const {
    contactName,
    sessionDate,
    sessionTime,
    photosToEdit,
    totalPrice,
    albumUpgrades,
    extraPhotoPrice = 35,
  } = input;

  const timeLine = sessionTime
    ? `<p style="margin:4px 0">זמן הצילום יתחיל בשעה <strong dir="ltr">${sessionTime}</strong></p>`
    : "";

  const packageParts: string[] = [];
  if (photosToEdit != null) packageParts.push(`${photosToEdit} תמונות מעובדות`);
  if (albumUpgrades?.trim()) packageParts.push(albumUpgrades.trim());
  const packageLine = packageParts.length > 0 ? packageParts.join(" · ") : "פרטי החבילה יימסרו בנפרד";
  const priceLine = totalPrice != null ? `בסך ${totalPrice} ש״ח` : "";

  const body = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BORDER};padding:14px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${CREAM};border-radius:4px">
        <tr><td style="padding:34px 34px 10px">

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:18px">
            <img src="${WORDMARK_URL}" alt="Michal" height="46" style="height:46px;width:auto" />
          </td></tr></table>

          <p style="margin:0 0 4px;color:${ROSE};font-size:19px;font-weight:bold">הי ${contactName || "יקרה"},</p>
          <p style="margin:0 0 4px;color:${BROWN};font-size:14px;line-height:1.8">
            שמחה ומתרגשת שבחרת בי לקחת חלק ולתעד את המשפחה שלכם ברגעים מרגשים אלו 💗
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${section(
              "מועד ושעת הצילום",
              `<p style="margin:4px 0">הצילומים יתקיימו בעז״ה ב${heDateLine(sessionDate)}</p>
               ${timeLine}
               <p style="margin:4px 0">יש להגיע 10 דקות קודם לפני הזמן שקבענו</p>`,
            )}

            ${section(
              "אופן התשלום",
              `<p style="margin:4px 0">נא לשלוח לי אסמכתא שהעברה שולמה לשולמית בן נאים.</p>
               <p style="margin:4px 0">במקרה של ביטול הצילומים ע״י הלקוחה — הביטול אינו מזכה בהחזר המקדמה (300 ש״ח).</p>`,
            )}

            ${section(
              "סטיילינג",
              `<p style="margin:4px 0">כדי שהתמונות והסטיילינג יהיו מדויקים ויפים, חשוב לי שהבגדים יהיו תואמים לאופי הסשן — ולכן אשמח לקחת חלק בבחירת הבגדים. לפני בחירה או קנייה, ניתן לשלוח תמונה ולהתייעץ.</p>
               <p style="margin:4px 0">לביבי — כל הביגוד והעיטופים עליי 🙂</p>`,
            )}

            ${section(
              "הכנות ליום הצילום",
              `<p style="margin:4px 0">על מנת שיהיה נוח יותר לנו ולביבי:</p>
               <p style="margin:4px 0">נדאג לקלח את הביבי בבוקר לפני היציאה לסטודיו.</p>
               <p style="margin:4px 0">אמא, בבקשה תדאגי לשמור על ערנות הביבי עד שמגיעים אליי.</p>
               <p style="margin:4px 0">נדאג להאכיל את הביבי שיגיע אליי שבע.</p>
               <p style="margin:4px 0">נא לדאוג מראש ל-2 בקבוקים של תמ״ל או חלב שאוב · מוצץ · שמיכה חמה · טיטולים · מגבונים.</p>`,
            )}

            ${section(
              "צילומים עם אחים",
              `<p style="margin:4px 0">יש להגיע מוכנים ולהצטייד ביום הצילום ב: מים, אוכל לא מלכלך, ממתקים מתגמלים למצולמים, מברשת שיער, גומיות, מגבונים.</p>
               <p style="margin:4px 0">מומלץ להגיע ערניים ורגועים על מנת שיהיו תוצאות מדויקות.</p>`,
            )}

            ${section(
              "הגעה ליום הצילומים",
              `<p style="margin:4px 0">את הסט המשפחתי נעשה ראשון, ולאחר מכן הילדים והאבא ישאירו אותנו עם הבייבי להמשך הצילומים.</p>
               <p style="margin:4px 0">זמן הצילומים משתנה בין תינוק לתינוק ובין ילד לילד — כל סט אורך בין 20–60 דקות, ולכן יש להיערך לכך לפי החבילה ומספר הסטים שנקבעו.</p>
               <p style="margin:4px 0">בחלל הסטודיו קיים ציוד בשווי עשרות אלפי שקלים — יש לנהוג בזהירות ולשמור על הילדים כדי שחלילה לא ייגרם נזק.</p>`,
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
              "פרטי החבילה",
              `<p style="margin:4px 0">סגרנו על חבילה מפנקת שכוללת: ${packageLine}${priceLine ? `, ${priceLine}` : ""}.</p>
               <p style="margin:4px 0">עיבוד תמונה נוספת מעבר לחבילה — בתשלום של ${extraPhotoPrice} ש״ח.</p>`,
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

/**
 * The studio's official equipment-usage guide (transmitter/flash/camera/
 * backgrounds/floors), transcribed from its real slide deck.
 *
 * Lives in its own file (not inline in ai.functions.ts / ai-tools.server.ts)
 * so both can import it without a circular dependency: the chat/voice system
 * prompt used to embed this text directly, but that meant every single
 * turn — even "is Tuesday free?" — paid for ~1,800 characters of equipment
 * troubleshooting content it never used. Real Groq logs showed this app's
 * requests hitting the free-tier token-per-minute limit; token cost/latency
 * is now something to actively trim, not just a nice-to-have. The guide is
 * exposed as an on-demand tool (get_equipment_guide in ai-tools.server.ts)
 * instead — the model calls it only when a customer actually asks an
 * equipment/setup question, at the cost of one extra tool round-trip on
 * just that minority of turns.
 */
export const STUDIO_GUIDE_HE = `1) המשדר (מחבר בין המצלמה לפלאש) — יש קופסה עם המשדר מאחורי הדלת בכניסה. קודם מחברים את המשדר למצלמה — עד הסוף ממש. מפעילים אותו: יש 2 לחצנים בצד, מזיזים אותם ימינה-למעלה. לא נדלק? מנסים שוב. עדיין לא? מחליפים סוללה — הסוללות נמצאות בקופסת הציוד שמעל עמדת הרקע הוורוד.
2) הפלאש — מפעילים בלחיצה ארוכה על הכפתור עם סימן המבזק/זיגזג, ומיד מסובבים את הגלגלת. בודקים שהמסך דלוק. עושים צילום בדיקה קצר — הפלאש אמור להבזיק. בודקים את התמונה: לא שרופה מדי ולא חשוכה מדי. לתיקון עוצמה: מסובבים את הגלגלת שוב — מספר נמוך יותר בגלגלת = אור חזק יותר.
3) המצלמה — למי שלא צלם/ת מקצועי/ת: מומלץ לכוון את המצלמה על אוטומט, וחובה לצלם דרך העינית ולא דרך המסך (ברוב המצלמות במצב הזה המסך לא יעבוד בכלל).
4) אם הפלאש לא הבזיק — לבדוק בסדר הזה: א) שהמשדר מחובר עד הסוף למצלמה. ב) שהמשדר מופעל כמו שצריך (2 הלחצנים בצד). ג) שהפלאש עצמו דלוק ומחובר.
5) רקעי צבע (חום בהיר / צהוב / כחול) — אפשר לדרוך עליהם בזהירות, אבל רק המצולמים. ילדים עם נעליים בסדר, אבל הורים וצלמים בלי נעליים על הרקע בבקשה.
6) רקעי נייר (לבן / ירוק במבוק) — אסור לדרוך עליהם בכלל, בשום מצב! על הרצפה לפניהם חובה להניח פלטת פורמייקה לבנה מבריקה, או קרשי עץ (לבנים/חום) — זה מגן על הנייר ונותן ברק. הנייר יורד מהקיר רק עד תחילת הקרשים — או שמרימים את הקרשים הצידה, אחרת הנייר נקרע. אפשר להשאיר את הנייר מגולגל בתחתית עם רצפת העץ, ולפתוח/לסגור בעדינות.
7) פינות רקע נוספות בסטודיו: קיר עץ + רולי רקעים (שם מאוחסנים גלילי הנייר כחול/ירוק/לבן) · קיר עץ + כיסא צהוב (פינה כפרית וחמימה, מתאימה לגיל שנה) · וילון + ספה בהירה (או וילון לבד בלי הספה — פינה נקייה ורכה). להשראה בתמונות אמיתיות מהרקעים — יש טאבלט בסטודיו, בדף השכרת אביזרים למטה.
8) רצפות עץ — צד לבן וצד אגוז חום, אפשר להפוך את הקרשים ולקבל מראה חדש. אזהרה חשובה: יש ברזל בכל קרש — להפוך בזהירות רבה! לנקות היטב לפני הצילומים (מטלית או מגבונים).
9) שאלה/תקלה שלא מכוסה כאן — תציע בחום להתקשר: 054-8529277.`;

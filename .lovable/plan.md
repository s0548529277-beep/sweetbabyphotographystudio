## מטרה
לתקן חסימות מלאי שגויות, לאפשר ביטול שריון/הזמנה, לעצב מחדש את דף היומן `/booking`, להחזיר טופס תיאום ציפיות native (לא iframe), ולסיים את חיבור סנכרון היומן ל-Google Calendar אוטומטית.

## מה יקרה

### 1) תיקון "הפריטים נתפסו בתאריכים אלה" לפריטים עם מלאי גדול מ-1
הבעיה: בטבלה `item_availability` יש `UNIQUE (item_id, date, slot_index)` שתלוי בעמודת `date` הישנה — פריטים עם `stock_quantity > 1` נופלים על התנגשות בעת ה-INSERT, גם כאשר יש יחידה פנויה. בנוסף חישוב `slot_index` ב-JS נעשה לפני ה-insert והוא רגיש למרוצי משתמשים בו-זמניים.

תיקון:
- מיגרציה: מחליפים את האילוץ ל-`UNIQUE (item_id, start_date, end_date, slot_index)` (טווח-תאריכים במקום יום בודד).
- בקוד `orders.functions.ts`: משתמשים ב-RPC `count_item_reservations` שכבר קיים לספירת התפוסים לפי טווח, וממחזרים slot_index בצורה עמידה למרוצים (ניסיון חוזר של insert עם slot מוגדל עד `stock`).
- הודעת השגיאה תהיה ברורה יותר: "פריט X לא זמין בתאריכים שנבחרו" רק כשבאמת אין יחידה פנויה.

### 2) ביטול שריון והזמנה
- `serverFn` חדש `cancelOrder(orderId)` ו-`cancelBooking(bookingId)`: מעדכנים סטטוס ל-`cancelled` (רק לבעל הרשומה או אדמין) ומוחקים את שורות `item_availability` המשויכות (עבור order). אם קיים `google_event_id` בשריון — מוחק גם מהיומן.
- באזור האישי (`/account`): כפתור "ביטול" ליד כל הזמנה/שריון עם סטטוס `pending`, עם `AlertDialog` לאישור.

### 3) עיצוב מחדש של `/booking` (יומן פנימי)
- פריסה חדשה, נקייה ומרווחת: כותרת + הסבר קצר, לוח שנה גדול משמאל, גריד שעות קומפקטי (כפתורים קטנים יותר במקום `h-11` → `h-9`, `text-xs`), סרגל צד כרזומה עם מחיר, ופס פעולה יחיד "המשך".
- הורדת כל תוכן "כללים/מדיניות" מהעמוד — הוא ייצא לטופס תיאום הציפיות.
- הצגה ברורה של: יום בשבוע, שעת פתיחה/סגירה, פסי חלוקה בין בוקר/צהריים/ערב.

### 4) טופס תיאום ציפיות native (חזרה)
- הסרת ה-iframe של Google Forms מ-`studio-rental.tsx`.
- בניית טופס native (כמו הקיים ב-`rental-catalog.tsx`) עם השאלות הקריטיות: שם, טלפון, מייל, סוג צילום, תאריך/שעה מבוקשים, מק"טים (אם רלוונטי), מצלמה, אישור תנאים.
- שמירה ב-DB (טבלה חדשה `studio_intake_forms`) + שליחת מייל אוטומטי דרך Lovable AI Gateway או `mailto` popup (בהתאם למה שכבר עובד באתר).
- הכפתור "המשך ליומן" בעמוד `studio-rental` יפתח את הטופס; לאחר שליחה תקינה מנווט אוטומטית ל-`/booking` (היומן הפנימי).

### 5) חיבור אוטומטי ל-Google Calendar
המשתמש כבר סיפק CLIENT_ID + CLIENT_SECRET ורענן טוקן ב-OAuth Playground.
- נשתמש ב-`add_secret` לשמור: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REFRESH_TOKEN` (שלושה סודות רגילים ב-runtime).
- הקוד ב-`src/integrations/google/calendar.server.ts` כבר קיים ומוכן — ברגע שהסודות מוגדרים, כל שריון חדש ייצור אוטומטית אירוע ביומן עם `summary="השכרת סטודיו · <שם לקוח>"` וללא נושא נוסף.
- ביטול שריון ימחק את האירוע (סעיף 2).

## פרטים טכניים

**מיגרציה:**
```sql
ALTER TABLE public.item_availability DROP CONSTRAINT IF EXISTS item_availability_item_id_date_slot_index_key;
ALTER TABLE public.item_availability ADD CONSTRAINT item_availability_range_slot_key UNIQUE (item_id, start_date, end_date, slot_index);

CREATE TABLE public.studio_intake_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);
-- GRANTs + RLS: users insert/select their own; admin sees all.
```

**קבצים שיושפעו:**
- `src/lib/orders.functions.ts` — retry-על-slot-index, RPC count.
- `src/lib/bookings.functions.ts` — הוספת cancelBooking.
- `src/lib/intake.functions.ts` (חדש) — שליחת טופס תיאום ציפיות.
- `src/routes/booking.tsx` — עיצוב חדש, כפתורים קטנים, ללא טקסטי כללים.
- `src/routes/studio-rental.tsx` — הסרת iframe, קריאה לטופס native, קיצור כללים.
- `src/routes/_authenticated/account.tsx` — כפתורי ביטול.
- מיגרציה חדשה תחת `supabase/migrations/`.

**סודות שיש להוסיף:** `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REFRESH_TOKEN` — אבקש להזין אותם באופן מאובטח לאחר אישור התוכנית.

## מה לא נעשה
- לא נשנה את `/rental-catalog` או את קטלוג האביזרים.
- לא נשנה חוקי מחירים או RLS מעבר לצורך.
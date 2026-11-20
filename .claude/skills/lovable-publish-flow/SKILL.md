---
name: lovable-publish-flow
description: תהליך הפרסום והדאטה של אתר הסטודיו (Lovable + GitHub + Supabase) — איך מפרסמים, איך מוודאים שהסנכרון הגיע, מיגרציית DB, בדיקת cron, ומה עושים כשפרסום נתקע. להשתמש לפני כל "פרסם", מיגרציית DB, או בדיקת סטטוס.
---

# פרסום, DB וסנכרון — Lovable + GitHub

## הארכיטקטורה
TanStack Start + Supabase; מתארח ב-Lovable. הקוד נכתב לריפו ב-GitHub (`main`) → Lovable מסנכרנת → `deploy_project` מעלה. אתר הצלמת (ריפו אחר) מפורסם באותה דרך, בנפרד.
- Lovable project id של הסטודיו: `7f3ae80d-8585-4972-a43d-424c2a2cc887`.
- כלי Lovable שמשתמשים בהם: `get_project`, `deploy_project`, `query_database`, `list_edits`. **לא** `send_message` לסוכן — עולה קרדיטים.

## פרסום — 4 צעדים
1. commit + push ל-`main` (בלי שכתוב היסטוריה: אין amend/force/rebase על מה שנדחף).
2. `get_project` → לחכות ש-`latest_commit_sha` שווה ל-commit שנדחף. נצפה: 2.5–9 דקות (Lovable מציגה `pending`). אם לא מסתנכרן ~10 דקות — לדחוף commit תיעודי קטן (שורת יומן) כדי לעורר סנכרון.
3. `deploy_project` (אסינכרוני; "pending" ו-URL **אינם** הוכחה שעלה). אם מוחזר 503 — לנסות שוב.
4. ביומן (`AGENTS.md`): ה-head שפורסם, ה-deploy id, "לא נבדק חי" (הסנדבוקס לא מגיע לאתר).

אם פרסום "עלה" אבל האתר ישן — לבדוק קודם שהבנייה עוברת (`npx tsc --noEmit`, `npx vite build`). פעם נכשלה בנייה בלי שאף אחד ראה: רכיב `Heart` התנגש עם `Heart` של lucide ב-4 קבצים (TS2300), ושלושה פרסומים לא החליפו את האתר.

## מה לא צריך פרסום
- `.claude/skills/**`, `AGENTS.md`, `.lovable/**`, `scripts/**` — נדחפים לגיט, לא משנים את האתר.
- שינוי נתונים ב-DB (`query_database`) — חי מיד.
- הגדרות Gmail (תוויות, מסננים) — חיות מיד; אבל הקוד שמתייג/מוצא תוויות לפי שם דורש פרסום (ראו `leads-and-followup`).

## מיגרציית DB
1. קובץ `drizzle/migrations/00NN_name.sql` **אידמפוטנטי** (`if not exists`), ושורה חדשה ב-`drizzle/migrations/meta/_journal.json`. המספר האחרון ביום הכתיבה: 0047.
2. להריץ חי עם `query_database`.
3. לרשום ב-`drizzle.__drizzle_migrations` (hash) כשאפשר; חלק מהמיגרציות לא נרשמו — ביומן לכתוב "applied live, registered / NOT registered".
4. `src/integrations/supabase/types.ts` — לעדכן ידנית לטבלה/עמודה חדשה (או `as any` עם הערה).
5. טבלה רגישה: RLS מופעל, בלי policies (service role בלבד) או admin-only.

## cron ו-scheduler
- טיוטות: pg_cron `email-drafts-every-5-min` קורא ל-`/api/run-email-drafts` דרך `net.http_post`, header `x-cron-secret` = `app_settings.email_drafts_cron_secret` (הסוד נוצר ב-DB, לא בגיט). הגבלות הריצה: `DEDICATED_DRAFT_LIMITS` ב-`email-drafts.server.ts`.
- הנתיב הישן `/api/send-booking-reminders` (תזכורות, סיכום שעתי וכו') מופעל ע"י scheduler **חיצוני** שאי אפשר לראות מכאן.
- בדיקה: `select * from net._http_response order by created desc limit 5;` (קוד 200, `created`, `ms`), `cron.job_run_details`, `app_settings.email_drafts_status` (`ms`, `pending`, `lastDraftAt`), `app_settings.scheduler_last_call` / `scheduler_last_run` / `scheduler_progress`.
- כיבוי: `select cron.unschedule('email-drafts-every-5-min');`.
- ריצה שנחתכת (`ms` מעל ~90000, או `email_drafts_last_run` חדש מ-`email_drafts_status.at`) → להוריד `concurrency` / `runBudgetMs`.

## אחרי כל פרסום — מה לבדוק
- ריצת cron מוצלחת אחת; מייל הזמנה בדיקה (תווית "הזמנת …", `From` = m0548529277@gmail.com, RTL בנייד); והשינוי הספציפי שנעשה.

## איפה זה חי
- **Claude:** סקיל זה. זה תהליך עבודה — לאתר אין חלק בו.

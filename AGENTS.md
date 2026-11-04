<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project instructions

- Read [.lovable/work-log-through-2026-10-27.md](.lovable/work-log-through-2026-10-27.md) before changes; the complete previous work log and standing instructions are preserved there.
- Record each session that changes code, data or settings below, newest first. Preserve owner edits and all historical log entries.
- Chat photo recommendations use public gallery reads and structured photo results, never private client galleries, to prevent exposing client photos even in admin chat.
- Gallery photo filtering lives in `src/lib/chat-gallery.ts` and its adjacent test so hidden/configuration rows cannot enter chat photo results.

## Work log

- **2026-11-04 (09:3x Israel) — Claude (chat, via GitHub, מיכל אישרה את השינויים בדיוק; לא פורסם):** תיקון/שיפור ממוקד של מערכת הטיוטות, בשני קבצים בלבד. (1) `email-draft-design.ts` (NEWBORN): מחירון ניו בורן שהיה שגוי תוקן — מיני 970₪/2 סטים, מפנקת 1,300₪/3 סטים (featured), חלומית 1,650₪/4 סטים; 8/10/15 תמונות ערוכות; addons לא שונו. (2) `email-drafts.server.ts` (KNOWLEDGE, פסקת "סל לידה" הוחלפה כולה): מאוחדת לא מחזירה על ייעוץ שינה → להציע 10% הנחה על החבילות הרגילות; אסור לכתוב סכום זיכוי מדויק (אי-התאמה 1,175₪ מול 1,200₪) — רק שסל מלא מכסה את המפנקת (1,300₪) כמעט במלואה/במלואה וששולמית תיתן את המספרים בשיחה; חשבון פנימי (2,350/3,150/800) מסומן "לא לציטוט ללקוחה"; חבילת סל = 4 סטים/12 תמונות/קולאז׳ למייל/אלבום 20/40/אונקי + סט משפחתי לבוחרת ניו בורן; הצעד הבא ללקוחה (טופס → שולמית → מיכל); שאלה הלכתית על המימוש — לא לנסח בעצמך, placeholder '[[מיכל: שאלה הלכתית על מימוש הסל — להשלים תשובה]]' + flag. (3) WRITER_RULES: קולגה ששואלת על ההסדר העסקי של מיכל — לא לנסח תשובה בעצמך (body '[[מיכל: קולגה שואלת על ההסדר שלך…]]', isClient=false, needsReply=true + flag); וניו בורן רגיל (לא סל לידה) בלי פירוט — לשאול כמה סטים ועם/בלי אלבום, ולהמליץ חבילה אחת במשפט קצר אם ניתן להסיק. OUTDOOR, עיצוב ולוגיקת הריצה לא נגעו. tsc עובר; לא נבדק על מייל חי; לא פורסם (יאושר בנפרד). תיקון עדכני (07:28 UTC): מיכל ביקשה לבטל את שורת FAVE — הוסרה, השורה "דוגמה: זיכוי סל לידה של כ-1,200₪…" חזרה למקור; כל השאר נשאר. גם: AGENTS.md היה מעל תקציב הגודל — רשומות 2026-10-30 → 2026-11-03 הועברו מילה במילה ל-`.lovable/work-log-through-2026-11-02.md`.

- **2026-11-04 (12:4x Israel) — Claude (chat, via GitHub, owners follow-ups: "MICHAL SIBONI in big letters is the logo; ALWAYS put my fixed email signature in photographer and personal replies" + "remove the whole 'by style' row in the props catalog"):** (1) `email-draft-design.ts`: the header is now the text wordmark "MICHAL SIBONI" (none for personal/general), and the closing block is HER REAL fixed Gmail signature = the GIF from her Drive (file id 1Qsx3Jj3sb6gz7HNO8ah7weYYIe0DhpXb) recoloured to the card colour `#f7f3ee` (photographer `cardBg` MUST equal it) -> `public/email/michal-signature.gif` (`https://sweetbabyphoto.shop/email/michal-signature.gif`), plus her three buttons (לגלריה שלי / לאתר הסטודיו / שליחת מייל). Regenerate: `python3 scripts/make-email-signature-gif.py <source.gif> <out.gif> "#f7f3ee"` (finished frame first for Outlook; fixed a palette-padding bug that painted the background black). Personal replies use the same look + signature. The older script-logo GIF and `make-michal-signature-gif.py` were removed. Preview rendered locally with headless Chrome; not tested on a live mail. (2) `rental-catalog.tsx`: the "לפי סגנון" chips row was removed (typed search still understands style words; `THEME_TOPICS` remains in `hebrew-search.ts`, unused by the page). tsc OK.

- **2026-11-04 (09:2x Israel) — Claude (chat, via GitHub, owner requests: "cancel Claude's automatic answer", "improve the studio-site automatic reply", "Michal's logo = the MOVING logo of the photographer site", "delicate design + Michal's animated signature logo in ALL replies, page background not white", "prepare drafts every 10 minutes 7:30–23:50"):** (1) Claude's own scheduled task "טיוטות למיילי ניו בורן" (every 5h) was DISABLED (not deleted) — only this site's assistant (`runEmailDraftAssistant`) prepares drafts now. (2) `email-draft-design.ts`: header + signature logo is now an animated GIF built from the photographer site's layers (`michal-logo.png` + `michal-heart.png`): `public/email/michal-signature-animated.gif`, regenerated with `python3 scripts/make-michal-signature-gif.py <out.gif> "#f6f0e4"` (bg colour MUST equal the photographer theme's `cardBg` or the GIF shows as a box; first frame = finished logo for Outlook). The old `michal-logo-animated-v2.gif` is no longer used. (3) Design: photographer look softened (light-sand frame `#e8dccb`, cream card, thin border, rounded corners); PERSONAL ("general") replies now use the same look + same signature block; studio brand unchanged. (4) `email-drafts.server.ts`: `MIN_GAP_MS` 20 → 9 min; window 07:30–23:50 Israel (`outside_hours`), Shabbat off. The real cadence is set by the EXTERNAL scheduler calling `/api/send-booking-reminders?key=…` (no pg_cron) — must be ≤ every 10 minutes. Last recorded run before the change: 07:00:22 UTC. Not tested on a live mail.

- רשומות ישנות יותר (ארכיון, מילה במילה): עד 2026-10-27 ב-`.lovable/work-log-through-2026-10-27.md`; 2026-10-30 → 2026-11-03 ב-`.lovable/work-log-through-2026-11-02.md`.

- Older entries (through 2026-10-28) were moved earlier to the archive file.

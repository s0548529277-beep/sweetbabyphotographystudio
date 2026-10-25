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

## Work log — every Claude session MUST add an entry here

Standing request from the owner (2026-10-25): **whatever a Claude session
changes in this project — code, database, settings — it records here, in
the same commit/push**, so the next Claude (chat, Claude Code, any surface)
knows what was done and why. Newest first. One short entry per session:
date, what changed, where, anything left open. Write the owner-facing
summary in Hebrew if useful, technical detail in English.

### Database migrations — read before touching the schema

Lovable's migration runner only knows `drizzle/migrations/` +
`drizzle/migrations/meta/_journal.json`, tracked in the live DB table
`drizzle.__drizzle_migrations` (hash = sha256 of the .sql file). **Files
added only to `supabase/migrations/` never run** — that is exactly how the
Oct 15–21 migrations below silently went missing while the code relying on
them shipped. If you add a migration outside Lovable: put it in
`drizzle/migrations/NNNN_name.sql`, add the journal entry, and either let
Lovable run it or apply it and insert its hash + `when` into
`drizzle.__drizzle_migrations` so Lovable won't re-run it.

### Log

- **2026-10-26 (00:05) — Claude (chat) — "יש שגיאה בהקראה בבוט".** Live call log showed: (1) admin-edited `voice_bot_phrases.greeting` had "וְולִמְצוֹא" (double vav) + stray ", ," / "...,"; (2) `menu_prompt` had a stray "דרכי ,"; (3) at night "אין מענה" was spoken twice (greeting + night notice). **DB updated live** (`voice_bot_phrases`, keys greeting / menu_prompt / menu_prompt_dtmf) — only typos/punctuation fixed, owner's wording kept. Previous values, for rollback: greeting = `הייי אני סוויט בוֹט  , הִגַּעְתֶּם לסטודיו סוויט בייבי. , לֹא הָיָה מַעֲנֶה כרגע , הכי טוב לרשום בגוגל סטודיו סוויט בייבי וְולִמְצוֹא הַכֹּל בָּאֲתָר. ..., `; menu_prompt = `אפשר\nלשאול אותי על  הזמנת סטודיו דרכי , הַשְׂכָּרַת אֲבִיזָרִים, דרכי הגעה , הַדְרָכָה לְשִׁמּוּשׁ בסטודיו,או הודעה  לצלמת מיכל. `; menu_prompt_dtmf only had its trailing comma → period. Code: night notice in `voice-after-hours.server.ts` no longer starts with "כרגע אין מענה".

- **2026-10-25 (23:55) — Claude (chat):** owner said the phone bot's voice "sounds terrible". All calls in the last 30 days are on Yemot (461 `yemot:` sessions, 0 Twilio), so the acoustic voice/speed is Yemot's `tts_voice` / `tts_rate` in their ניהול panel — not this repo (see the voice-bot section below). Only code change: the night notice in `voice-after-hours.server.ts` now says times in words ("עשר בלילה", "שמונה בבוקר") instead of digits. Owner was given the Yemot INI steps to try `tts_voice=Osnat` / `Sivan` and a moderate `tts_rate`.

- **2026-10-25 (23:45) — Claude (chat) — phone bot night hours REVISED: no hangup.** Owner asked that the bot stay on after 22:00. `voice-after-hours.server.ts` now exports `afterHoursNotice()`: 22:00–08:00 a NEW call (Yemot first-hit branch / Twilio incoming) hears the normal greeting + "כרגע אין מענה. איסוף והחזרת אביזרים אינם מתאפשרים אחרי 22:00 — אפשר לתאם מחר מ-8:00 בבוקר (after midnight: מ-8:00 בבוקר). בינתיים אפשר להמשיך כאן כרגיל." + the menu, then everything works as usual. The earlier hang-up block (entry below) is removed. Shared bot knowledge `SYSTEM` in `ai.functions.ts` (used by site chat AND voice) got a line: props pickup/return until 22:00 only, no human answer 22:00–8:00. Not yet tested with a real call.

- **2026-10-25 (23:40) — Claude (chat):** owner: the studio's Canon 5D Mark III camera is included in the studio rental price. Camera is now its own FAQ question (professional camera, included, suits experienced photographers or with a guidance package; old #7 split into camera + guidance questions, 12 Q&A total) + the intake-form camera hint in `studio-rental.tsx`, and added a "מצלמה" line to the site-bot knowledge in `ai.functions.ts`.

- **2026-10-25 (late night, cont.) — Claude (chat) — שאלות נפוצות בהשכרת סטודיו + SEO**
  - `/studio-rental`: new FAQ section "לפני שמשריינים" (`STUDIO_FAQS`, 11 Q&A, native `<details>`), placed above ArrivalDirections, plus `FAQPage` JSON-LD in the route head. Every answer reuses facts already on the page (rulesBlocks / quickFacts / intake form) or in `ai.functions.ts` — keep them in sync if prices/rules change. Props policy deliberately omitted (owner still deciding "עד 20 אביזרים").
  - SEO: `/studio-rental` title + og:title → "השכרת סטודיו לצילום בבית שמש | סוויט בייבי", description rewritten (fixed "סמאש קיק , חלאקה ," spacing). Site-wide description in `__root.tsx` + `index.tsx` (6 meta tags) fixed: missing commas, "-הצלמת", "קיק"→"קייק".
  - Blog posts (חלאקה, אביזרי ניו-בורן, סמאש קייק): text link to `/studio-rental` under the CTA buttons.

- **2026-10-25 (late night) — Claude (chat) — צבירה מ-100, איסוף/החזרה עד 22:00, סרטון בהשכרה, בוט טלפון שקט מ-22:00 (owner approved, merged to main)**
  - Cashback minimum 150 → 100 ₪: `loyalty.ts` (`CASHBACK_MIN_AMOUNT`, the real logic) + texts in `studio-rental.tsx`, `ai.functions.ts`, `voice-phrases.server.ts` DEFAULT_PHRASES, `admin.bot-knowledge.tsx`. If an admin-edited row in `voice_bot_phrases` / bot-knowledge DB still says 150, it overrides the default — check `/admin/voice-bot-text` and `/admin/bot-knowledge`.
  - Props pickup/return only until 22:00 (owner confirmed 22:00): new `src/lib/props-hours.ts`; `max` on time inputs + client check in `checkout.tsx` / `rental-catalog.tsx`; zod refine on `start_time`/`end_time` in `orders.functions.ts`; note in catalog/cart rules and `Footer.tsx`.
  - `/studio-rental`: small "סרטון הסטודיו" button next to "הדרכה לשימוש בסטודיו" opens the homepage reel (`/videos/studio-reel.mp4`) in a modal.
  - Phone bot quiet hours 22:00–08:00 Asia/Jerusalem (`src/lib/voice-after-hours.server.ts`): NEW calls hear "שלום, הגעת לסטודיו סוויט בייבי. כרגע אין מענה. אפשר לחזור אלינו מחר מ-8:00 בבוקר." and are hung up. Yemot (`api.yemot.ivr.ts`) skips it when a `voice_call_sessions` row already exists (call in progress); Twilio (`api.voice.incoming.ts`) is always a new call. Website chatbot NOT changed (owner chose phone only). Text is a constant, not admin-editable. Not yet tested with a real call.
  - **Open:** "עד 20 אביזרים שריון חינם" (studio-rental.tsx ×3, booking.tsx, ai.functions.ts) — owner said it is inaccurate and is still deciding the replacement; untouched.
- **2026-10-25 (night) — Claude (chat) — לידים ופניות + "כמה נכנס" בסקירה**
  - **New `/admin/leads` ("לידים ופניות", in the admin nav under ניהול לקוחות):** table `public.inquiry_leads` (NOT the older `public.leads` = newsletter sign-ups). Status (חדשה/נענתה/נשלח מעקב/סגרה/לא רלוונטי), topic, source, WhatsApp/mail links, inline notes, summary cards + conversion %, manual add.
  - **Filled automatically** by the owner's hourly scheduled email-assistant task (Claude, outside this repo) through `public.upsert_lead_from_assistant(p_token, p jsonb)` — SECURITY DEFINER, callable with the anon key, guarded by a secret token whose sha256 is hard-coded in the function (the token itself lives only in the scheduled task's prompt). It also logs referrals mailed to שולמית בן נעים (`referred_to_shulamit`, source `shulamit`). To rotate the token: `CREATE OR REPLACE` the function with a new hash and update the task.
  - **DB applied live:** `drizzle/migrations/0023_inquiry_leads.sql`, registered in journal + `drizzle.__drizzle_migrations` (24 rows). RPC tested (bad token rejected, good token inserts); test row deleted.
  - **`/admin` (סקירה):** new top block "כמה נכנס" — big total + small ניו בורן / אביזרים / סטודיו, toggle החודש/השנה/הכל. Newborn = `newborn_package_orders.total_price`; `bookings` rows with `package = 'newborn'` are skipped (they are the studio-blocking mirror of those orders with the same price). **Open:** `/admin/finance` still counts those `package='newborn'` mirror bookings as "השכרת סטודיו" income — likely double/mis-counted there; not changed tonight.
- **2026-10-25 — Claude (chat) — newborn gallery upgrades (merged to main from `claude/newborn-gallery-upgrades`, published)**
  - Newborn gallery: originals never sent in the page payload, ZIP downloads only via `claimNewbornZipDownload` (limit 2 per section, shown to client, admin reset), file names + client notes per photo in the selection email, auto-tick timeline steps, one-click email+WhatsApp send, editable email texts (settings), first-view notify + 3-day unopened nudge, extra photos sold at selection (+total_price), newborn orders shown in ניהול לקוחות.
  - **DB already applied live:** `drizzle/migrations/0022_newborn_gallery_upgrades.sql` (registered, 23 rows). Code builds + tsc clean. Not yet clicked through in a browser after publishing.
- **2026-10-25 — Claude (chat): sleep-consultant page hidden from customers**
  - Owner asked that `/sleep-consultant` not be shown to customers. Removed
    its footer link (`Footer.tsx`) — that was the only link to it anywhere —
    and added `robots: noindex, nofollow` to its head. The route itself still
    exists and opens by direct URL (not in `public/sitemap.xml`). If it ever
    needs to be fully blocked, gate it or delete the route.
- **2026-10-25 — Claude (chat), at the owner's request — ChikTime features into newborn packages**
  - בעלת האתר ביקשה: להעתיק את אפשרויות ChikTime (שכבר נבנו ב"ניהול לקוחות") לתוך מערכת הניו-בורן הקיימת, בעיצוב של עמוד עצמאי, **בלי למחוק כלום**.
  - **`/admin/newborn-packages`** is now a full-screen page (own sticky header + back button; `FULLSCREEN_PATHS` in `admin.tsx` skips the site header/sidebar/footer for it and for `/admin/client-management`). New tabs: "לוח שנה" (Hebrew dates + holidays, week/month, click day → new order on that date, click order → edit), "הגדרות" (same `client_management_settings` as ניהול לקוחות). Existing tabs kept (old calendar renamed "יומן יומי"). List/table got search + CSV export; OrderCard got a WhatsApp button; create/edit show Hebrew date, holiday/Shabbat + same-day warnings and confirm before booking on a rest day; dashboard lists upcoming orders with no email.
  - Shared pieces: `HebrewCalendar` (`components/client-management/CalendarTab.tsx`), `DateHints`/`confirmRestDay` (`DateHints.tsx`); `SettingsTab` now takes `{ settings }` only.
  - **Reminders:** `runDueClientManagementReminders` now also emails newborn-order clients before the session (same hours-before / no-Shabbat settings) and includes newborn orders in the daily schedule email. `updateNewbornOrderContact` clears `reminder_sent_at` when date/time changes.
  - **DB:** `drizzle/migrations/0021_client_management_newborn_reminders.sql` = the cm_* tables (applied by hand on 2026-10-24 from `supabase/migrations/20261024000000_client_management.sql`, idempotent) + `newborn_package_orders.reminder_sent_at`. Applied live and registered in the journal and `drizzle.__drizzle_migrations` (22 rows).
  - Note: prettier reformatted `admin.newborn-packages.tsx` / `newborn-orders.functions.ts`, so the diff is larger than the logic change.
- **2026-10-24 — Claude (chat) — new "ניהול לקוחות" (`/admin/client-management`)**
  - ChikTime-style area on its own `cm_clients` / `cm_sessions` / `cm_payment_accounts` tables (admin-only RLS): dashboard, session journal, Hebrew calendar, client cards, payment accounts with summary emails, reminders + daily schedule (`client-management.functions.ts`, run from `/api/send-booking-reminders`). Not connected to newborn orders / bookings / finance — sessions there do NOT block the studio.
- **2026-10-25 (later same session) — Claude (chat): open PRs review**
  - **PR #72 (sleep-consultant page for שולמית בן נעים) — merged by hand.**
    GitHub couldn't merge it (conflict, branch from Aug 25); copied
    `src/routes/sleep-consultant.tsx` + `src/components/SleepConsultantMark.tsx`
    verbatim, re-added its footer link, regenerated `routeTree.gen.ts` via
    build. PR closed with a note.
  - **Not merged, left open for the owner to decide (all site-bot, Aug 23–24):**
    #58 adds a red "מחיקת הזמנות לא רלוונטיות (Admin)" link with `to="#"` to the
    *public* `/track` page — does nothing and is visible to customers;
    #43 is an August restyle of `index.tsx` that conflicts with the current
    homepage and would roll back newer design; #35 replaces "משפחות" with
    "לקוחות" in `index.tsx` — the word no longer appears there, already moot.

- **2026-10-25 — Claude (chat), at the owner's request**
  - **DB:** found that 8 migration files in `supabase/migrations/`
    (20261015…–20261021…) had never been applied: `client_step`/
    `production_step`, `newborn_package_types`, album-details columns,
    `expenses.is_personal`, `manual_income.is_personal`,
    `bookings.balance_paid`, `outdoor_package_types`/`_orders`,
    `recurring_expenses`. Effect before the fix: the אישי/עסק tag on
    expenses/income was silently dropped (insertWithPersonalFallback),
    recurring expenses, "סמן יתרה כשולמה", outdoor packages etc. all
    errored. Bundled them verbatim as
    `drizzle/migrations/0020_apply_pending_oct15_oct21.sql` (+ explicit
    `GRANT … TO authenticated` on the 4 new tables; RLS still admin-only),
    ran it in one transaction directly on the live DB, registered it in
    the journal and in `drizzle.__drizzle_migrations` (21 rows now).
    Nothing dropped; row counts unchanged.
  - **Code:** `/admin/finance` — new "הכנסות לפי תחום" block under the
    summary cards: income split into צילומים בסטודיו / השכרת סטודיו /
    השכרת אביזרים (+ "אחר (ידני)" when non-zero), with % of total; follows
    all filters; clicking a card sets the "סוג" filter. Expenses are not
    split (their categories don't map to a business line).
  - **Open:** old PRs on GitHub — see the "open PRs review" entry above.

## Phone voice bot — TWO separate channels, TWO separate voices

**Update 2026-09-02, superseding the note below from 2026-08-25**: that
earlier note said there was no ימות המשיח (Yemot Hamashiach) integration in
this repo. That was true *at the time* (confirmed by an exhaustive search)
but is no longer — a full Yemot integration landed shortly after
(`src/lib/yemot.server.ts`, `src/routes/api.yemot.ivr.ts`,
`src/lib/voice-phrases.server.ts`, `src/lib/voice-menu.server.ts`, and more).
The lesson, not just the correction: **re-check before asserting a repo
doesn't have something, especially if real-world behavior (a user's actual
live phone line) contradicts what a code search found** — the code may
simply not have existed yet.

The phone AI assistant ("נועה") answers on **two independent channels that
share the same conversation logic and phrase text but are otherwise
unrelated integrations**:

- **Twilio** (`src/lib/twilio.server.ts`, `src/routes/api.voice.incoming.ts`,
  `src/routes/api.voice.respond.ts`) — TwiML webhooks. Its TTS voice IS
  controllable from this codebase: `/admin/voice-bot` writes `app_settings`
  (key `"voice_bot_voice"`, values `"default" | "female" | "male"`), and
  `src/lib/voice-settings.server.ts` resolves that into a `voice="Google.he-
  IL-Wavenet-C/-D"` attribute on `<Say>` (Twilio proxies non-English TTS
  through Google Cloud voices this way — there's no direct Google Cloud TTS
  API call anywhere in this repo). See `voice-bot-options.ts` for the exact
  IDs.
- **ימות המשיח (Yemot Hamashiach)** (`src/lib/yemot.server.ts`,
  `src/routes/api.yemot.ivr.ts`) — a bespoke plain-text IVR2 protocol (see
  that file's own doc comment for the directive shapes). Yemot's own
  built-in TTS engine reads the text — **its voice's actual sound (male/
  female) is a setting on Yemot's own side (their ניהול panel/file
  manager), not something any code here can control.** `/admin/voice-bot-
  text` only controls the bot's *grammatical* self-reference gender
  (`bot_voice_gender` in `voice-phrases.server.ts`) — a wording choice, not
  the acoustic voice — precisely because the acoustic voice isn't ours to
  set. If the actual live phone line's voice sound needs to change, that's
  done in Yemot's admin, not here.

Both channels pull their spoken phrases from the same source
(`voice-phrases.server.ts`'s `DEFAULT_PHRASES` / `voice_bot_phrases` table,
admin-edited at `/admin/voice-bot-text`) and both run conversation turns
through `src/lib/voice-chat.server.ts`'s `runVoiceTurn` — so a change to
either of those affects both channels. If a user says a phone bot behaves a
particular way, check *which channel their real number actually points to*
before assuming; don't assume it's Twilio just because that's the channel
with more code in this repo, or Yemot just because "ימות המשיח" was
mentioned — both are real and live.

`voice-bot-options.ts` (plain constants, no `.server` suffix) is
deliberately separate from `voice-settings.server.ts` (touches
`supabaseAdmin`) so the Twilio admin picker page can import the constants
without pulling server-only code into the client bundle — this project's
`*.server.ts` files are a hard client/server boundary; importing one from a
client-rendered route component breaks the build.

### Yemot's own `ext.ini`/`ivr.ini` settings (2026-09-02) — not this repo's code

These live entirely on Yemot's side (edited in their ניהול panel → הגדרות
מתקדמות → עריכת קבצי INI, on the same API-type extension whose `api_link`
points at `/api/yemot/ivr`) — nothing in this repo sets or reads them, but
they're recorded here since they came out of the same investigation as the
code changes below, and a future session (or the studio owner) may ask
about them again. Sourced from a GitHub-hosted snapshot of Yemot's own
support forum (`NHLOCAL/tools` repo, `skills/yemot-telephony/references/
snapshot/*.md` — the live forum at f2.freeivr.co.il is not reachable from
this environment), not guessed:
- `tts_voice=<name>` — the acoustic TTS voice. Confirmed values: female —
  `Sivan`, `Osnat`, `ymFemale`; male — `ymMale` (system default, aka
  "Gilad"), `Elik_2100`, `Jacob`. Some modules need the key to be `voice`
  instead — check if `tts_voice` doesn't seem to take effect.
- `tts_rate=<n>` — reading speed, integer **-10 to 10 only** (10 = fastest,
  0 = default). 10 is the actual ceiling — there's no faster setting past
  it. Some modules need the key to be `rate` instead; safe to set both
  lines together since Yemot ignores whichever key doesn't apply.
- `api_say_tts=no` — disables Yemot's own default behavior of reading back
  ("שיקוף") whatever it just transcribed from the caller's speech before
  continuing. This is what actually fixed a report of "the bot repeats
  every message I say back to me" — it's a Yemot-platform default, not
  anything this app's code was doing. (`api_voice_ask_ok=yes` is a
  *different*, opt-in "please confirm what I heard" prompt — leave it
  unset/`no`, it would make the repeating worse, not better.)

### `THINKING_FILLER_KEY` — hiding AI "thinking" latency on the Yemot line

Added 2026-09-02, in code this time (`voice-phrases.server.ts`,
`yemot.server.ts`'s `yemotSayThenResume`, `api.yemot.ivr.ts`'s
`ai_pending` stage) — see `THINKING_FILLER_KEY`'s own doc comment in
`voice-phrases.server.ts` for the full mechanism. Short version: Yemot's
protocol is fully synchronous, so an AI turn that takes several seconds
(up to 30s, up to 6 tool-call rounds — see `runVoiceTurn`'s own comment for
why that budget isn't safe to shrink) means the caller hears total silence
the whole time. This setting makes the bot say `phrases.thinking_filler`
("רגע אחד...") immediately, then does the real (slow) work on the follow-up
hit. **It does not make the AI faster, only fills the dead air.**

**Redesigned same day, later:** the first version used a bare
`id_list_message` (no `read`/listen step) banking on an unconfirmed
assumption — sourced from `yemot-router2`'s docs, never actually exercised
live — that Yemot auto-continues to the next hit on its own after a bare
`id_list_message` instead of just stopping. It shipped OFF by default and
was never tested. `yemotSayThenResume` now reuses the ordinary `read`
(speech-listen) directive instead — the exact same mechanism every other
turn in this app already relies on successfully, every call — so there is
no new, unconfirmed protocol behavior being bet on. **Defaults ON** as of
this redesign (an explicit "off" row at `/admin/voice-bot-text` still wins)
— still worth one real test call after deploying, same as any phone-bot
change, but no longer gated behind a manual, unverified opt-in.

An optional short hold-tone/music segment (`THINKING_FILLER_MUSIC_KEY`, also
admin-editable) can play for a couple of seconds right before the spoken
filler — syntax is `h-<musicName>[,<maxSec>]` per `makeMessagesData` in
`yemot-router2`'s own source (`github.com/ShlomoCode/yemot-router2`,
`lib/response-functions.js`; the full directive-name mapping there:
`file:f, text:t, speech:s, digits:d, number:n, alpha:a, zmanim:z,
go_to_folder:g, system_message:m, music_on_hold:h, date:date, dateH:dateH`,
segments joined by `.`). `musicName` has to already exist as an uploaded
file in **this specific Yemot account's own** file/music library (their
ניהול panel) — nothing in this codebase can discover or default that id
sensibly, so it's left blank (no tone, words only) until an admin finds a
real id there and enters it.

### Speed — what's actually controllable from here vs. Yemot's own side

A direct report ("תשפר מהירות") is mostly about *perceived* speed on the
Yemot line specifically — the thinking-filler above is the main lever this
codebase has (fills dead air; doesn't shorten the real wait). Two more
levers exist but live entirely in Yemot's own `ext.ini`/`ivr.ini` (see
below, un-verified whether they're actually SET on the live account — worth
checking if speed is still a live complaint after the filler ships):
`tts_rate=10` (already the documented ceiling, no faster setting exists)
and `api_say_tts=no` (stops Yemot's own speech-recognition readback, which
otherwise doubles perceived latency by repeating what she just said before
continuing). A tighter AI tool-call/timeout budget was tried before and
made real calls fail *more* often (see `runVoiceTurn`'s own comment) — don't
re-try shrinking that without new evidence it's actually safe now.

### Booking intent overrides menu mode, always (2026-09-02)

`api.yemot.ivr.ts`'s stage-"menu" handling checks `wantsToBookNow(speech)`
(a narrow, explicit word list — "לשריין", "רוצה תור", "הזמנת סטודיו" etc.,
see `voice-menu.server.ts`) **before** the `menuMode === "ai"` early-return,
not just in "fixed" mode. Reasoning: an explicit, unambiguous "book now"
utterance should reliably end in a real reservation via the deterministic
no-AI flow (`voice-noai-booking.server.ts`) — the same guarantee "fixed"
mode always gave — rather than depend on whether the AI's own tool-calling
happens to follow through on that specific turn. This is deliberately
narrow: anything less direct (a bare date mention, a pricing question)
still goes to the AI in "ai" mode exactly as before, so its natural
flexibility for everything else is untouched. Added per a direct report
that phone bookings had stopped completing reliably after "ai" mode became
the default — if that report turns out to have had a different root cause
(e.g. `create_phone_booking` itself failing), this reorder is still a
reasonable safety net to keep, not something to revert on its own.

### Newborn-package orders actually block studio availability (2026-09-05)

Per a direct report, an admin-created newborn-package order
(`/admin/newborn-packages`, `newborn_package_orders` table — a lightweight
internal CRM, see that table's own migration comment) was expected to stop
a customer from renting the studio during the same window, and didn't.
`studioAvailability` (`availability.server.ts`) is the ONE function every
real availability check in this app calls — it reads busy time from the
`bookings` table directly and only SECONDARILY merges in Google Calendar
(`listGoogleCalendarBusy`) as an extra source, not a replacement. A Google
Calendar event alone (`newborn-orders.functions.ts`'s
`syncNewbornCalendarEvent`) is therefore a visual-only mirror that doesn't
actually protect availability if that connector isn't linked/working —
`syncNewbornBookingBlock` (same file) is the part that does: it inserts a
REAL row into `bookings` for the order's session window, exactly like any
other studio booking, and keeps it in sync (delete-then-recreate, same
pattern as the calendar sync) as the order's date/time/contact changes.

Two non-obvious things this needed:
- **`bookings.deposit_status` must NOT be `"pending"`.** `bookingBlocksSlot()`
  (`availability.server.ts`) treats a `"pending"` deposit as a temporary
  hold that EXPIRES after `PENDING_HOLD_MINUTES` (60, or
  `PHONE_BOOKING_HOLD_MINUTES` for a marked phone booking) unless renewed —
  wrong for a session an admin already committed to. Any other string
  (`syncNewbornBookingBlock` uses `"not_required"`) blocks permanently,
  matching a real booking once its deposit is actually paid.
- **`bookings.user_id` is `NOT NULL` + a real FK to `auth.users`.** A
  newborn-package customer usually has no site account at all, so the
  blocking booking is owned by the ADMIN'S OWN user id (the one
  creating/editing the order) instead of inventing a customer account just
  to satisfy the constraint — reads as "the studio owner blocked this slot
  herself," which is exactly what's happening.

Also worth knowing for next time: **supabase-js's query builder
(`PostgrestBuilder`) is `PromiseLike`-only — it implements `.then()`, NOT
`.catch()` or `.finally()`.** `someQuery.catch(() => {})` throws
`TypeError: ...catch is not a function` at runtime; use plain `await` (a
query error resolves as `{ data, error }`, it never rejects the promise
over an ordinary query failure) or check `.then()`'s own result instead.
This is different from a real `Promise`-returning function like
`deleteGoogleCalendarEvent`, which genuinely does support `.catch()`.

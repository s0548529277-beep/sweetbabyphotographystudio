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

- **2026-11-02 (01:10 Israel) — Claude (chat, via GitHub, from a Lovable "chatbot crashes on prop search" alert):** `findSkusByText` in `src/lib/availability.server.ts` called `makeHebrewMatcher` but the import from `@/lib/hebrew-search` was never added (Lovable's 2026-11-01 change), so every bot prop search / availability check ("יש כיסא עץ פנוי ב-5/11?") threw. Added the missing import. No other changes, no DB changes.

- **2026-11-01 (21:45 Israel) — Lovable:** forgiving Hebrew catalog search (`src/lib/hebrew-search.ts`): construct/plural forms, missing yod, prefixes, multi-word any order, category name, synonyms for חלאקה/סמאש קייק/בגדים. Used in `/rental-catalog` and the bot (`findSkusByText`). No DB changes.

- **2026-10-31 (19:10 Israel) — Claude (chat, via GitHub, owner request "more spacious, with a progress line"):** `StepTracker.tsx` redesigned — one continuous track that fills to the current step (RTL), ✓ on completed steps, ring on the current one, "שלב X מתוך Y" chip + current-step title, roomier grid labels, optional `hint`. New `CLIENT_STEP_HINTS` in `gallery-steps.ts` shown on the client pages (`newborn.gallery.$token.tsx`, `my-photos.tsx`, roomier card). Step 3 label shortened to "כיתובים, קולאז' וכריכה". Admin trackers use the same component (no hint). vite build OK.

- **2026-10-30 (14:05 Israel) — Claude (chat, via GitHub, owner request "like ChikTime"):** client newborn gallery now needs an email code on a new device. Table `newborn_gallery_access` (migration `20261030120000_newborn_gallery_access.sql`, applied live; RLS on, no policies; stores SHA-256 hashes only, kinds `code`/`device`). `requestNewbornGalleryCode` mails a 6-digit code (15 min, max 5 attempts, 1/min and 5/hour) via sendGmail; `verifyNewbornGalleryCode` returns a device key kept in localStorage (`sb-gallery-device:<token>`). Every gallery by-token fn (`getNewbornGalleryByToken`, `claimNewbornZipDownload`, note/album-details/toggle/finish/unlock-receipt) now uses `galleryOrderByToken(token, deviceKey)` → throws `VERIFY_REQUIRED`; page shows `GalleryCodeGate`. Orders without an email keep link-only access (1 of 14 at the time). Admin order page has "צפייה כמו הלקוחה" (`createNewbornGalleryPreviewKey`, opens `?dk=`) so Michal can preview without mailing the client. Contract pages unchanged. tsc + vite build OK.

- **2026-10-30 (12:55 Israel) — Claude (chat, via GitHub, owner request; merged from branch `claude/gallery-media-proxy` into main):** client-gallery photos served through the site domain so NetFree/Netiv/Etrog clients can see them (storage host *.lovable.cloud is blocked). New `src/lib/media-url.ts` (`toSiteMediaUrl`: storage public/sign URL → `/media/...`) and proxy route `src/routes/media.$.ts` (forwards path + signed token to storage, no service key, 404 on bad paths). Applied in `getNewbornGalleryByToken`, `claimNewbornZipDownload` and `getMyPhotoGalleries`; emails unchanged. vite build OK. No migrations. Next: NetFree whitelist request for sweetbabyphoto.shop.

- **2026-10-30 (11:30 Israel) — Claude (chat, via GitHub, owner request "שפר את הטיוטות" + contract look):** (1) Draft writing (`WRITER_RULES` / `analyze` in `email-drafts.server.ts`): understand who is writing first (client vs. her own Yad-2 sale, colleague photographer, supplier, שולמית) — services/price lists/buttons only for a client who asked; no upselling, nothing pushed after "not relevant"; plain everyday wording like Michal, no marketing clichés; length follows the incoming message (short → 1–3 sentences, first inquiry ≤120 words); `needsReply=false` when the last message only closes the conversation ("תודה, לא רלוונטי"); CTA only when it is the natural next step. Trigger: a draft offered studio rental + outdoor family shoots to a photographer who had just said "not relevant" about an item Michal was selling. (2) Design (`email-draft-design.ts`): photographer + studio drafts now use the contract-email look — coloured frame (brown #a9784f / green #2d3d2b), cream card, real logos (`michal-logo-wordmark.png`, `logo-green-hero.png`, absolute URLs like the contracts), ♥ divider, small logo at the bottom. "general" brand unchanged (plain). tsc clean, previews rendered locally.

- **2026-10-30 (11:15 Israel) — Claude (chat, via GitHub, owner request):** email-draft assistant now cleans up after she answers. `cleanupAnsweredThreads()` in `email-drafts.server.ts` runs every assistant run (before new drafts): for threads labelled "טיוטה מוכנה ✍️" where she has a SENT message, drafts OLDER than her latest sent message are deleted (Gmail drafts.delete — owner explicitly asked to delete), then the label is removed and "נשלח ✓" added if her reply is the newest message. A newer draft (follow-up, or one she started after sending) is kept and the label stays. Side effect: those threads are no longer excluded from follow-ups forever (the follow-up query skipped READY-labelled threads). No-conflict with Claude chat drafts: drafts are now listed with paging (`listAllDrafts`, was capped at 100 of 200+), any open draft in a thread blocks a second one; Claude chat labels its own drafts' threads "טיוטה מוכנה ✍️" so the same cleanup covers them. `email_drafts_status` now has `cleaned`. tsc clean; not run live yet. No migrations.

- **2026-10-30 (02:00 Israel) — Claude (via GitHub, scheduled at owner request):** follow-up drafts now update the matching `inquiry_leads` row (status `follow_up`, `follow_up_sent_at`, note `FOLLOWUP_DRAFT_NOTE`) and are skipped for leads marked `booked` / `not_relevant` (`findLead` / `markFollowUpDraft` in `email-drafts.server.ts`). `/admin/leads` has a "📞 למי לחזור היום" box (new >1 day unanswered; replied, quiet 3+ days, no follow-up) and text fixed to "בדיקה כל 20 דקות". Removed the home-page "האתר בהרצה" beta banner from `Header.tsx`. No migrations, no security changes. Published.

- Older entries (2026-10-27 to 2026-10-28) moved to the archive file above.

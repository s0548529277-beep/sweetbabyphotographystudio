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

- **2026-10-30 (12:55 Israel) — Claude (chat, via GitHub, owner request; merged from branch `claude/gallery-media-proxy` into main):** client-gallery photos served through the site domain so NetFree/Netiv/Etrog clients can see them (storage host *.lovable.cloud is blocked). New `src/lib/media-url.ts` (`toSiteMediaUrl`: storage public/sign URL → `/media/...`) and proxy route `src/routes/media.$.ts` (forwards path + signed token to storage, no service key, 404 on bad paths). Applied in `getNewbornGalleryByToken`, `claimNewbornZipDownload` and `getMyPhotoGalleries`; emails unchanged. vite build OK. No migrations. Next: NetFree whitelist request for sweetbabyphoto.shop.

- **2026-10-30 (11:30 Israel) — Claude (chat, via GitHub, owner request "שפר את הטיוטות" + contract look):** (1) Draft writing (`WRITER_RULES` / `analyze` in `email-drafts.server.ts`): understand who is writing first (client vs. her own Yad-2 sale, colleague photographer, supplier, שולמית) — services/price lists/buttons only for a client who asked; no upselling, nothing pushed after "not relevant"; plain everyday wording like Michal, no marketing clichés; length follows the incoming message (short → 1–3 sentences, first inquiry ≤120 words); `needsReply=false` when the last message only closes the conversation ("תודה, לא רלוונטי"); CTA only when it is the natural next step. Trigger: a draft offered studio rental + outdoor family shoots to a photographer who had just said "not relevant" about an item Michal was selling. (2) Design (`email-draft-design.ts`): photographer + studio drafts now use the contract-email look — coloured frame (brown #a9784f / green #2d3d2b), cream card, real logos (`michal-logo-wordmark.png`, `logo-green-hero.png`, absolute URLs like the contracts), ♥ divider, small logo at the bottom. "general" brand unchanged (plain). tsc clean, previews rendered locally.

- **2026-10-30 (11:15 Israel) — Claude (chat, via GitHub, owner request):** email-draft assistant now cleans up after she answers. `cleanupAnsweredThreads()` in `email-drafts.server.ts` runs every assistant run (before new drafts): for threads labelled "טיוטה מוכנה ✍️" where she has a SENT message, drafts OLDER than her latest sent message are deleted (Gmail drafts.delete — owner explicitly asked to delete), then the label is removed and "נשלח ✓" added if her reply is the newest message. A newer draft (follow-up, or one she started after sending) is kept and the label stays. Side effect: those threads are no longer excluded from follow-ups forever (the follow-up query skipped READY-labelled threads). No-conflict with Claude chat drafts: drafts are now listed with paging (`listAllDrafts`, was capped at 100 of 200+), any open draft in a thread blocks a second one; Claude chat labels its own drafts' threads "טיוטה מוכנה ✍️" so the same cleanup covers them. `email_drafts_status` now has `cleaned`. tsc clean; not run live yet. No migrations.

- **2026-10-30 (02:00 Israel) — Claude (via GitHub, scheduled at owner request):** follow-up drafts now update the matching `inquiry_leads` row (status `follow_up`, `follow_up_sent_at`, note `FOLLOWUP_DRAFT_NOTE`) and are skipped for leads marked `booked` / `not_relevant` (`findLead` / `markFollowUpDraft` in `email-drafts.server.ts`). `/admin/leads` has a "📞 למי לחזור היום" box (new >1 day unanswered; replied, quiet 3+ days, no follow-up) and text fixed to "בדיקה כל 20 דקות". Removed the home-page "האתר בהרצה" beta banner from `Header.tsx`. No migrations, no security changes. Published.

- **2026-10-28 (evening) — Claude (via GitHub, owner request to save Lovable credits):** admin chat stuck/timeouts fixed — `run_readonly_query` appends `LIMIT 200`, so a model-written LIMIT caused a syntax error and retry loop; queries are now wrapped as a subquery (`src/lib/readonly-sql.ts`, used by `ai-admin-tools.server.ts` and `admin-site-bot.functions.ts`). Admin chat step limit 10 → 4 (customers unchanged at 8). Admin rules name `inquiry_leads` and forbid repeated retries. `admin_snapshot` now returns `draftsStatus` (last run of the email-draft assistant). `/admin/leads` shows a last-run card for the draft assistant (time, drafts created, errors) and a "טיוטה מחכה בג׳ימייל – עוד לא נשלחה" note on new leads whose draft was prepared (marker written into notes by `email-drafts.server.ts`, `DRAFT_READY_NOTE`). No migrations, no security changes, catalog images untouched. Not yet published — publish from Lovable.

- **2026-10-28 (09:25 UTC) — Lovable:** chat bubble shows "מצב מנהלת 👑" badge and a "שיחה חדשה" reset button; bare site paths in bot replies become pill buttons (`linkifyPaths` in `ChatBot.tsx`); bot told to always write Markdown links; admin rules answer "am I in admin mode" explicitly. Published.

- **2026-10-28 — Lovable:** chat bubble now also sends its verified access token so admin mode activates; Markdown links in chat render as pill buttons (internal links navigate in-app); stronger email-draft writing rules in `email-drafts.server.ts`. Published.

- **2026-10-27 — Owner clarification:** all catalog-storage images are intentionally public. Preserved existing access; proposed dismissing the exposure alert with owner approval rather than restricting catalog photos. No database changes.

- **2026-10-27 (21:16 UTC) — Lovable:** added web-only `show_gallery_photos` in `ai-tools.server.ts`, structured photos in `ai.functions.ts`, and photo grid in `ChatBot.tsx`. Inspiration requests previously received only a gallery link; verified real newborn request renders four images. Rejected Markdown images no longer become hearts. Added public-photo filtering regression tests. Updated Mermaid and DOMPurify (3.4.17); dependency finding closed. Catalog storage permissions unchanged, awaiting owner decision. Historical AGENTS content preserved verbatim in the archive to meet the root instruction size limit.

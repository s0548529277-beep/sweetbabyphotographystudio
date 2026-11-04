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

- **2026-11-04 (09:2x Israel) — Claude (chat, via GitHub, owner requests: "cancel Claude's automatic answer", "improve the studio-site automatic reply", "Michal's logo = the MOVING logo of the photographer site", "delicate design + Michal's animated signature logo in ALL replies, page background not white", "prepare drafts every 10 minutes 7:30–23:50"):** (1) Claude's own scheduled task "טיוטות למיילי ניו בורן" (every 5h) was DISABLED (not deleted) — only this site's assistant (`runEmailDraftAssistant`) prepares drafts now. (2) `email-draft-design.ts`: header + signature logo is now an animated GIF built from the photographer site's layers (`michal-logo.png` + `michal-heart.png`): `public/email/michal-signature-animated.gif`, regenerated with `python3 scripts/make-michal-signature-gif.py <out.gif> "#f6f0e4"` (bg colour MUST equal the photographer theme's `cardBg` or the GIF shows as a box; first frame = finished logo for Outlook). The old `michal-logo-animated-v2.gif` is no longer used. (3) Design: photographer look softened (light-sand frame `#e8dccb`, cream card, thin border, rounded corners); PERSONAL ("general") replies now use the same look + same signature block; studio brand unchanged. (4) `email-drafts.server.ts`: `MIN_GAP_MS` 20 → 9 min; window 07:30–23:50 Israel (`outside_hours`), Shabbat off. The real cadence is set by the EXTERNAL scheduler calling `/api/send-booking-reminders?key=…` (no pg_cron) — must be ≤ every 10 minutes. Last recorded run before the change: 07:00:22 UTC. Not tested on a live mail.

- רשומות ישנות יותר (ארכיון, מילה במילה): עד 2026-10-27 ב-`.lovable/work-log-through-2026-10-27.md`; 2026-10-30 → 2026-11-03 ב-`.lovable/work-log-through-2026-11-02.md`.

- Older entries (2026-10-27 to 2026-10-28) moved to the archive file above.

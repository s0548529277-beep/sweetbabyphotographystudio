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

- **2026-10-27 — Owner clarification:** all catalog-storage images are intentionally public. Preserved existing access; proposed dismissing the exposure alert with owner approval rather than restricting catalog photos. No database changes.

- **2026-10-27 (21:16 UTC) — Lovable:** added web-only `show_gallery_photos` in `ai-tools.server.ts`, structured photos in `ai.functions.ts`, and photo grid in `ChatBot.tsx`. Inspiration requests previously received only a gallery link; verified real newborn request renders four images. Rejected Markdown images no longer become hearts. Added public-photo filtering regression tests. Updated Mermaid and DOMPurify (3.4.17); dependency finding closed. Catalog storage permissions unchanged, awaiting owner decision. Historical AGENTS content preserved verbatim in the archive to meet the root instruction size limit.

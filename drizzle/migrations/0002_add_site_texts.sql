-- Generic site-wide text override system, powering a "click any text on
-- the live site to edit it" admin mode (see src/components/SiteTexts.tsx).
-- Unlike the narrow, per-feature text tables elsewhere in this app
-- (voice_bot_phrases, the birth-basket email template, the newborn
-- contract template — each admin-edited from its own dedicated textarea
-- page, consumed server-side by bots/emails, never rendered as live page
-- copy), this is a single flat key->value table covering arbitrary copy
-- anywhere on the public site. Keyed by the original (built-in) text
-- itself rather than a synthetic id — there's no stable per-string id
-- anywhere in this codebase's ~3,000 hardcoded Hebrew strings to key off
-- instead, and matching by the normalized original text is exactly what
-- SiteTexts.tsx's DOM-walking apply step does at render time.
--
-- Ported from the same working pattern already shipped on a sibling
-- Lovable project (benoam-siach / Hananya Mense — see that repo's
-- `claude/edit-texts` branch, `supabase/migrations/20261006120000_site_texts.sql`
-- and `src/components/site-texts.tsx`), adapted to this app's existing
-- admin-role check (private.has_role) instead of that project's
-- is_site_admin() function.
CREATE TABLE IF NOT EXISTS public.site_texts (
  original_text text PRIMARY KEY,
  new_text text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Must be readable by EVERY site visitor (not just admins) since the
-- override has to render on public pages for anyone — unlike admin-only
-- content tables elsewhere in this app.
GRANT SELECT ON public.site_texts TO anon, authenticated;
GRANT ALL ON public.site_texts TO service_role;
ALTER TABLE public.site_texts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_texts_public_read" ON public.site_texts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "site_texts_admin_write" ON public.site_texts FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
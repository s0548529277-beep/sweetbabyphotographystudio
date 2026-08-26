-- Tracks where a phone call is in the fixed key-press menu (1 studio /
-- 2 props / 3 directions / 4 studio guide / 5 free chat) before it hands
-- off to the open AI conversation — see voice-menu.server.ts.
ALTER TABLE public.voice_call_sessions
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'menu';

NOTIFY pgrst, 'reload schema';

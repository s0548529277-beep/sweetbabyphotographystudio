-- 2026-11-20: WhatsApp incoming files of any type. Keep the original file name and mime type next to the stored copy
-- so the admin screen can show a proper name, preview what a browser can open and offer a download for the rest.
alter table public.whatsapp_messages add column if not exists media_filename text;
alter table public.whatsapp_messages add column if not exists media_mime text;

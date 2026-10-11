ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS business_phone text;
NOTIFY pgrst, 'reload schema';
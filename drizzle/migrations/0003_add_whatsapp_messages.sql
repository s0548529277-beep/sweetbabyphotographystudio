-- Stores every WhatsApp message (in both directions) sent/received through
-- the official WhatsApp Business Platform (Meta Cloud API) integration —
-- see src/lib/whatsapp.server.ts and /admin/whatsapp. Keyed loosely by
-- phone number (not a strict FK to any customer table — a WhatsApp contact
-- may or may not have a site account), same "no account required" spirit
-- as newborn_package_orders / voice_call_sessions elsewhere in this app.
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Meta's own message id (wamid...) — used to de-duplicate webhook
  -- retries and to match delivery/read status updates back to the row.
  wa_message_id text UNIQUE,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  -- The OTHER party's number in E.164-ish digits, as Meta sends it (e.g. "972501234567") — never the studio's own number.
  phone text NOT NULL,
  contact_name text,
  body text,
  media_url text,
  media_type text CHECK (media_type IS NULL OR media_type IN ('image', 'video', 'document', 'audio')),
  -- 'sent' | 'delivered' | 'read' | 'failed' (outgoing, updated by status webhooks) | 'received' (incoming)
  status text NOT NULL DEFAULT 'received',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_messages_phone_idx ON public.whatsapp_messages (phone, created_at DESC);

GRANT SELECT ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Admin-only read. All writes (both the incoming webhook and the admin
-- "send" action) go through service_role inside server functions — same
-- pattern as voice_call_sessions — so there's no authenticated INSERT/UPDATE
-- policy to reason about here.
CREATE POLICY "whatsapp_messages_admin_select" ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
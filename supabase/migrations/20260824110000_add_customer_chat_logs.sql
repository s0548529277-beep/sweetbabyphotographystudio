-- Every conversation held with the customer-facing chat widget (ChatBot.tsx),
-- not just ones that end in a booking — the admin wants to see what people
-- are actually asking, always. One row per browser chat session
-- (client-generated session_id, kept in sessionStorage), updated in place
-- as the conversation grows so there's exactly one row per visit's chat,
-- not one per message.
CREATE TABLE public.customer_chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.customer_chat_logs TO authenticated;
GRANT ALL ON public.customer_chat_logs TO service_role;
ALTER TABLE public.customer_chat_logs ENABLE ROW LEVEL SECURITY;

-- Admin-only read. All writes go through the chat server function using
-- service_role — same pattern as site_bot_requests.
CREATE POLICY "customer_chat_logs_admin_select" ON public.customer_chat_logs FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

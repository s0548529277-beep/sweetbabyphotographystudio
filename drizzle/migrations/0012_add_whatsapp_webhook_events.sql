CREATE TABLE public.whatsapp_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id TEXT NOT NULL UNIQUE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT
);

CREATE INDEX whatsapp_webhook_events_pending_idx ON public.whatsapp_webhook_events (received_at) WHERE processed_at IS NULL;

GRANT ALL ON public.whatsapp_webhook_events TO service_role;

ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.whatsapp_webhook_events IS 'Durable inbox for verified WhatsApp webhook deliveries from the Lovable connector gateway. Written by service_role only; no client access.';
-- Tags each message with which of the studio's own WhatsApp numbers it
-- came in on / was sent from (Meta's own "display_phone_number" from the
-- webhook payload's metadata, or the connection used to send) — groundwork
-- for connecting more than one WhatsApp number to /admin/whatsapp later.
-- See src/lib/whatsapp-numbers.ts for the label mapping. Nullable: existing
-- rows and any row saved before this column existed just show no tag.
ALTER TABLE public.whatsapp_messages ADD COLUMN business_phone text;

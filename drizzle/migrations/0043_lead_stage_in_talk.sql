-- New lead stage "in_talk" (בשיחה). inquiry_leads.status is free text, so no schema change; the e-mail assistant's upsert
-- now also never overwrites a lead that Michal moved to "in_talk" (like booked / not_relevant).
CREATE OR REPLACE FUNCTION public.upsert_lead_from_assistant(p_token text, p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') <> '3b262b0f63e74f8b8522b1670520a6ae2e9a2333de96ae5057558aac911df475' THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  IF nullif(p->>'gmail_thread_id', '') IS NOT NULL THEN
    SELECT id INTO v_id FROM public.inquiry_leads WHERE gmail_thread_id = p->>'gmail_thread_id' LIMIT 1;
  END IF;
  IF v_id IS NULL AND nullif(p->>'email', '') IS NOT NULL THEN
    SELECT id INTO v_id FROM public.inquiry_leads WHERE lower(email) = lower(p->>'email')
      ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.inquiry_leads (name, email, phone, source, topic, message, status,
      referred_to_shulamit, first_contact_at, last_contact_at, follow_up_sent_at, gmail_thread_id, notes)
    VALUES (
      nullif(p->>'name',''), nullif(p->>'email',''), nullif(p->>'phone',''),
      coalesce(nullif(p->>'source',''), 'email'), coalesce(nullif(p->>'topic',''), 'other'),
      left(nullif(p->>'message',''), 2000), coalesce(nullif(p->>'status',''), 'new'),
      coalesce((p->>'referred_to_shulamit')::boolean, false),
      coalesce((p->>'first_contact_at')::timestamptz, now()),
      (p->>'last_contact_at')::timestamptz, (p->>'follow_up_sent_at')::timestamptz,
      nullif(p->>'gmail_thread_id',''), nullif(p->>'notes',''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.inquiry_leads SET
      name = coalesce(nullif(p->>'name',''), name),
      phone = coalesce(nullif(p->>'phone',''), phone),
      email = coalesce(email, nullif(p->>'email','')),
      topic = CASE WHEN coalesce(p->>'topic','') IN ('', 'other') THEN topic ELSE p->>'topic' END,
      message = coalesce(left(nullif(p->>'message',''), 2000), message),
      status = CASE WHEN status IN ('booked','not_relevant','in_talk') THEN status
                    ELSE coalesce(nullif(p->>'status',''), status) END,
      referred_to_shulamit = referred_to_shulamit OR coalesce((p->>'referred_to_shulamit')::boolean, false),
      last_contact_at = coalesce((p->>'last_contact_at')::timestamptz, last_contact_at),
      follow_up_sent_at = coalesce((p->>'follow_up_sent_at')::timestamptz, follow_up_sent_at),
      gmail_thread_id = coalesce(gmail_thread_id, nullif(p->>'gmail_thread_id','')),
      notes = CASE WHEN nullif(p->>'notes','') IS NULL THEN notes
                   WHEN notes IS NULL THEN p->>'notes'
                   ELSE notes || E'\n' || (p->>'notes') END,
      updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_lead_from_assistant(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_lead_from_assistant(text, jsonb) TO anon, authenticated;

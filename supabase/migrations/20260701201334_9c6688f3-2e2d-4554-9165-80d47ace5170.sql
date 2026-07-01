
DROP POLICY IF EXISTS "anyone can insert lead" ON public.leads;
CREATE POLICY "public intake lead" ON public.leads FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(trim(email)) BETWEEN 5 AND 200
    AND length(trim(full_name)) BETWEEN 1 AND 120
    AND length(trim(phone)) BETWEEN 5 AND 40
    AND length(trim(referral_source)) BETWEEN 1 AND 200
  );

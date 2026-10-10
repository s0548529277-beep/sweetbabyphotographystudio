UPDATE public.subscription_plans SET validity_months = 8 WHERE id = '648ddc77-e80f-4692-8955-7851a2f5d80e';

UPDATE public.subscription_passes
SET expires_at = expires_at + interval '2 months'
WHERE plan_id = '648ddc77-e80f-4692-8955-7851a2f5d80e'
  AND status = 'active';
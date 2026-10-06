-- The previous migration (20261006120000) seeded "כרטיסיית 10 כניסות" with
-- the same validity_months (6) as the 5-entry plan — the actual request was
-- 6 months for the 5-entry card and 8 months for the 10-entry card. Fixing
-- as a follow-up UPDATE rather than editing that migration's already-run
-- INSERT, so this corrects the row regardless of whether that migration
-- already executed in this environment. Scoped to the still-default
-- total_entries/price for this plan so a plan an admin has since
-- customized by hand isn't silently overwritten.
UPDATE public.subscription_plans
SET validity_months = 8
WHERE name = 'כרטיסיית 10 כניסות'
  AND total_entries = 10
  AND price = 1300;

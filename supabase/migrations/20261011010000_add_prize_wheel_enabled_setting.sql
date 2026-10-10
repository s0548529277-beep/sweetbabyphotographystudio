-- Global on/off switch for the prize wheel (גלגל המתנות) — see
-- src/lib/wheel.functions.ts's wheelEnabled() and /admin/prize-wheel.
-- Seeded disabled per explicit owner request to freeze the wheel for
-- customers for now, with the option to re-enable it later from admin.
INSERT INTO public.app_settings (key, value) VALUES ('prize_wheel_enabled', 'false')
  ON CONFLICT (key) DO NOTHING;

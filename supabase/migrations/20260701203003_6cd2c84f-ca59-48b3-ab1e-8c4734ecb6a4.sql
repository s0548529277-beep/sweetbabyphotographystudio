
GRANT SELECT ON public.items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;

GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;

GRANT SELECT, INSERT ON public.leads TO anon, authenticated;
GRANT ALL ON public.leads TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_availability TO authenticated;
GRANT ALL ON public.item_availability TO service_role;

GRANT SELECT ON public.studio_closures TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.studio_closures TO authenticated;
GRANT ALL ON public.studio_closures TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

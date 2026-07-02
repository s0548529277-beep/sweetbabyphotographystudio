
-- Public read tables (catalog)
GRANT SELECT ON public.items TO anon, authenticated;
GRANT ALL ON public.items TO service_role;

GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;

GRANT SELECT ON public.studio_closures TO anon, authenticated;
GRANT ALL ON public.studio_closures TO service_role;

-- User-owned tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;

GRANT INSERT ON public.leads TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

-- item_availability: keep column-level restriction (order_id hidden from public)
GRANT SELECT (id, item_id, date, slot_index, created_at) ON public.item_availability TO anon, authenticated;
GRANT INSERT ON public.item_availability TO authenticated;
GRANT ALL ON public.item_availability TO service_role;

-- Migrate all RLS policies and storage policies from public.has_role to private.has_role,
-- then drop the public has_role function to remove the privilege-escalation vector.
-- Also remove the open item_availability policy that exposes order_id to the public.

-- 1. order_items
DROP POLICY IF EXISTS "order_items_admin" ON public.order_items;
DROP POLICY IF EXISTS "order_items_view" ON public.order_items;

CREATE POLICY "order_items_admin" ON public.order_items
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "order_items_view" ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (o.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role))
  ));

-- 2. leads
DROP POLICY IF EXISTS "admin can read leads" ON public.leads;

CREATE POLICY "admin can read leads" ON public.leads
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- 3. item_availability
DROP POLICY IF EXISTS "admin deletes availability" ON public.item_availability;
DROP POLICY IF EXISTS "admin reads availability" ON public.item_availability;

CREATE POLICY "admin deletes availability" ON public.item_availability
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin reads availability" ON public.item_availability
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- 4. studio_closures
DROP POLICY IF EXISTS "admin manages closures" ON public.studio_closures;

CREATE POLICY "admin manages closures" ON public.studio_closures
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- 5. admin_notifications
DROP POLICY IF EXISTS "Admins can update notifications" ON public.admin_notifications;
DROP POLICY IF EXISTS "Admins view notifications" ON public.admin_notifications;

CREATE POLICY "Admins can update notifications" ON public.admin_notifications
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins view notifications" ON public.admin_notifications
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- 6. storage.objects
DROP POLICY IF EXISTS "user reads own receipts" ON storage.objects;
DROP POLICY IF EXISTS "items_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "items_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "items_admin_delete" ON storage.objects;

CREATE POLICY "user reads own receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND ((auth.uid())::text = (storage.foldername(name))[1] OR private.has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "items_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'items' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "items_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'items' AND private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'items' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "items_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'items' AND private.has_role(auth.uid(), 'admin'::app_role));

-- 7. Remove the privilege-escalation vector
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);

-- 8. Remove public availability read that exposes order_id
DROP POLICY IF EXISTS "anyone reads availability slots" ON public.item_availability;
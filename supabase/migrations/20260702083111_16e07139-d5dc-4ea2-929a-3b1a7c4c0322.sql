-- Tighten EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, PUBLIC;
-- has_role is called from RLS policies scoped TO authenticated; keep authenticated EXECUTE, revoke from anon/PUBLIC
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;

-- Storage policies for the private 'items' bucket
DROP POLICY IF EXISTS "items_read_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "items_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "items_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "items_admin_delete" ON storage.objects;

CREATE POLICY "items_read_authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'items');

CREATE POLICY "items_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'items' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "items_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'items' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'items' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "items_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'items' AND public.has_role(auth.uid(), 'admin'));
-- Two-way sync of newborn package orders with the photographer site (michalsiboni.co.il).
-- Each order lives on the site where it was created ("native", external_source IS NULL). The other
-- site keeps a mirror row (external_source = the creating site, external_id = the native id).
--   * native created / edited / deleted -> mirror created / updated / deleted on the other site
--   * mirror edited                     -> the same fields are copied back to the native row
--   * deleting a mirror never deletes the native order (and is never sent)
-- Loops are blocked twice: rows written by the sync set the transaction-local flag app.syncing
-- (triggers skip while it is set), and the creation of a mirror row is never pushed back.
-- Synced fields only (contract, gallery, calendar and album state stay per site).
-- Here -> photographer: pg_net call to the photographer site's public RPC apply_remote_order (publishable key + shared secret).
-- Photographer -> here: the route /api/photographer-sync calls apply_remote_order below.
-- The shared secret is app_settings.photographer_sync_secret (admin-only table).
-- Idempotent.

CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.newborn_package_orders
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS newborn_package_orders_external_uidx
  ON public.newborn_package_orders (external_source, external_id)
  WHERE external_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.newborn_sync_payload(r public.newborn_package_orders) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public AS $f$
  SELECT jsonb_build_object(
    'id', r.id, 'external_source', r.external_source, 'external_id', r.external_id, 'created_at', r.created_at,
    'package_id', r.package_id, 'addons', r.addons, 'base_price', r.base_price, 'addons_price', r.addons_price,
    'total_price', r.total_price, 'contact_name', r.contact_name, 'contact_phone', r.contact_phone,
    'contact_email', r.contact_email, 'session_date', r.session_date, 'session_time', r.session_time,
    'notes', r.notes, 'amount_paid', r.amount_paid, 'last_payment_at', r.last_payment_at,
    'birth_basket_used', r.birth_basket_used, 'date_deposit_at', r.date_deposit_at,
    'shoot_done_at', r.shoot_done_at, 'photos_sent_at', r.photos_sent_at, 'payment_done_at', r.payment_done_at,
    'editing_done_at', r.editing_done_at, 'album_design_done_at', r.album_design_done_at,
    'printing_done_at', r.printing_done_at, 'delivered_at', r.delivered_at)
$f$;

CREATE OR REPLACE FUNCTION public.push_newborn_order_to_photographer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF current_setting('app.syncing', true) = '1' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' AND NEW.external_source IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' AND OLD.external_source IS NOT NULL THEN RETURN OLD; END IF;
  -- edits of a mirror row travel back to its native site only while app_settings.sync_mirror_edits = '1'
  IF TG_OP = 'UPDATE' AND NEW.external_source IS NOT NULL
     AND coalesce((SELECT value FROM public.app_settings WHERE key = 'sync_mirror_edits'), '') <> '1' THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM net.http_post(
      url := 'https://biwpatdupnwgsqubfjnc.supabase.co/rest/v1/rpc/apply_remote_order',
      headers := jsonb_build_object('Content-Type','application/json', 'apikey', 'sb_publishable_Xle6iIUq9kjHiiuS6XOcFw_hmZuIzjP'),
      body := jsonb_build_object(
        'p_secret', (SELECT value FROM public.app_settings WHERE key = 'photographer_sync_secret'),
        'p_op', CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END,
        'p_order', CASE WHEN TG_OP = 'DELETE'
          THEN jsonb_build_object('id', OLD.id, 'external_source', OLD.external_source, 'external_id', OLD.external_id)
          ELSE public.newborn_sync_payload(NEW) END));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'photographer sync failed: %', SQLERRM;
  END;
  RETURN COALESCE(NEW, OLD);
END $f$;

DROP TRIGGER IF EXISTS trg_push_newborn_order_to_photographer ON public.newborn_package_orders;
CREATE TRIGGER trg_push_newborn_order_to_photographer
  AFTER INSERT OR DELETE OR UPDATE OF package_id, addons, base_price, addons_price, total_price, contact_name, contact_phone,
    contact_email, session_date, session_time, notes, amount_paid, last_payment_at, birth_basket_used, date_deposit_at,
    shoot_done_at, photos_sent_at, payment_done_at, editing_done_at, album_design_done_at, printing_done_at, delivered_at
  ON public.newborn_package_orders
  FOR EACH ROW EXECUTE FUNCTION public.push_newborn_order_to_photographer();

-- Receives a change from the photographer site (called by /api/photographer-sync with the service role).
CREATE OR REPLACE FUNCTION public.apply_remote_order(p_secret text, p_op text, p_order jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  s text;
  v_src_id text := p_order->>'id';
  v_src_ext text := p_order->>'external_source';
  v_src_ext_id text := p_order->>'external_id';
  v_row_id uuid;
  v_n int;
BEGIN
  SELECT value INTO s FROM public.app_settings WHERE key = 'photographer_sync_secret';
  IF s IS NULL OR p_secret IS DISTINCT FROM s THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF v_src_id IS NULL OR v_src_id = '' THEN RAISE EXCEPTION 'missing id'; END IF;
  PERFORM set_config('app.syncing', '1', true);

  IF v_src_ext IS NULL THEN
    -- native on the photographer site -> mirror here
    IF p_op = 'delete' THEN
      DELETE FROM public.newborn_package_orders WHERE external_source = 'photographer' AND external_id = v_src_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RETURN jsonb_build_object('ok', true, 'action', 'delete', 'deleted', v_n);
    END IF;
    IF coalesce(p_order->>'package_id','') = '' OR coalesce(p_order->>'contact_name','') = ''
       OR coalesce(p_order->>'contact_phone','') = '' THEN
      RAISE EXCEPTION 'missing required fields';
    END IF;
    INSERT INTO public.newborn_package_orders (
      package_id, addons, base_price, addons_price, total_price, contact_name, contact_phone, contact_email,
      session_date, session_time, notes, amount_paid, last_payment_at, birth_basket_used, date_deposit_at,
      shoot_done_at, photos_sent_at, payment_done_at, editing_done_at, album_design_done_at, printing_done_at,
      delivered_at, created_at, external_source, external_id)
    SELECT x.package_id, coalesce(x.addons, '[]'::jsonb), coalesce(x.base_price, 0), coalesce(x.addons_price, 0),
      coalesce(x.total_price, 0), x.contact_name, x.contact_phone, x.contact_email, x.session_date, x.session_time,
      x.notes, coalesce(x.amount_paid, 0), x.last_payment_at, coalesce(x.birth_basket_used, false), x.date_deposit_at,
      x.shoot_done_at, x.photos_sent_at, x.payment_done_at, x.editing_done_at, x.album_design_done_at,
      x.printing_done_at, x.delivered_at, coalesce(x.created_at, now()), 'photographer', v_src_id
    FROM jsonb_populate_record(NULL::public.newborn_package_orders, p_order) x
    ON CONFLICT (external_source, external_id) WHERE external_id IS NOT NULL DO UPDATE SET
      package_id = EXCLUDED.package_id, addons = EXCLUDED.addons, base_price = EXCLUDED.base_price,
      addons_price = EXCLUDED.addons_price, total_price = EXCLUDED.total_price, contact_name = EXCLUDED.contact_name,
      contact_phone = EXCLUDED.contact_phone, contact_email = EXCLUDED.contact_email,
      session_date = EXCLUDED.session_date, session_time = EXCLUDED.session_time, notes = EXCLUDED.notes,
      amount_paid = EXCLUDED.amount_paid, last_payment_at = EXCLUDED.last_payment_at,
      birth_basket_used = EXCLUDED.birth_basket_used, date_deposit_at = EXCLUDED.date_deposit_at,
      shoot_done_at = EXCLUDED.shoot_done_at, photos_sent_at = EXCLUDED.photos_sent_at,
      payment_done_at = EXCLUDED.payment_done_at, editing_done_at = EXCLUDED.editing_done_at,
      album_design_done_at = EXCLUDED.album_design_done_at, printing_done_at = EXCLUDED.printing_done_at,
      delivered_at = EXCLUDED.delivered_at
    RETURNING id INTO v_row_id;
    RETURN jsonb_build_object('ok', true, 'action', 'upsert', 'id', v_row_id);

  ELSIF v_src_ext = 'studio' AND v_src_ext_id IS NOT NULL THEN
    -- the photographer site's mirror of MY native order was edited -> copy the fields back (never create, never delete)
    IF p_op = 'delete' THEN RETURN jsonb_build_object('ok', true, 'action', 'ignored'); END IF;
    UPDATE public.newborn_package_orders t SET
      package_id = coalesce(x.package_id, t.package_id), addons = coalesce(x.addons, t.addons),
      base_price = coalesce(x.base_price, t.base_price), addons_price = coalesce(x.addons_price, t.addons_price),
      total_price = coalesce(x.total_price, t.total_price), contact_name = coalesce(x.contact_name, t.contact_name),
      contact_phone = coalesce(x.contact_phone, t.contact_phone), contact_email = x.contact_email,
      session_date = x.session_date, session_time = x.session_time, notes = x.notes,
      amount_paid = coalesce(x.amount_paid, t.amount_paid), last_payment_at = x.last_payment_at,
      birth_basket_used = coalesce(x.birth_basket_used, t.birth_basket_used), date_deposit_at = x.date_deposit_at,
      shoot_done_at = x.shoot_done_at, photos_sent_at = x.photos_sent_at, payment_done_at = x.payment_done_at,
      editing_done_at = x.editing_done_at, album_design_done_at = x.album_design_done_at,
      printing_done_at = x.printing_done_at, delivered_at = x.delivered_at
    FROM jsonb_populate_record(NULL::public.newborn_package_orders, p_order) x
    WHERE t.id = v_src_ext_id::uuid AND t.external_source IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'action', 'update', 'updated', v_n);
  END IF;
  RETURN jsonb_build_object('ok', true, 'action', 'ignored');
END $f$;
REVOKE ALL ON FUNCTION public.apply_remote_order(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_remote_order(text, text, jsonb) TO service_role;

-- One-off full resync of the native orders (call: select public.sync_all_newborn_to_photographer();)
CREATE OR REPLACE FUNCTION public.sync_all_newborn_to_photographer() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE r public.newborn_package_orders; n int := 0;
BEGIN
  FOR r IN SELECT * FROM public.newborn_package_orders WHERE external_source IS NULL LOOP
    PERFORM net.http_post(
      url := 'https://biwpatdupnwgsqubfjnc.supabase.co/rest/v1/rpc/apply_remote_order',
      headers := jsonb_build_object('Content-Type','application/json', 'apikey', 'sb_publishable_Xle6iIUq9kjHiiuS6XOcFw_hmZuIzjP'),
      body := jsonb_build_object(
        'p_secret', (SELECT value FROM public.app_settings WHERE key = 'photographer_sync_secret'),
        'p_op', 'upsert', 'p_order', public.newborn_sync_payload(r)));
    n := n + 1;
  END LOOP;
  RETURN n;
END $f$;
REVOKE ALL ON FUNCTION public.sync_all_newborn_to_photographer() FROM PUBLIC, anon, authenticated;

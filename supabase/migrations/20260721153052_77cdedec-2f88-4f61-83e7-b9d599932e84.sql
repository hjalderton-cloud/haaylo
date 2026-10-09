
-- 1. Set search_path on email queue helper functions (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

-- 2. Revoke EXECUTE from anon/authenticated on SECURITY DEFINER helpers
-- that should only be callable by trusted server code (service_role).
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Role/plan helpers: authenticated users need these for RLS checks; anon does not.
REVOKE EXECUTE ON FUNCTION public.owns_project(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_director_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_scheduler(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_engine_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_director_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_scheduler(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_engine_plan(uuid) TO authenticated;

-- 3. Scope suppressed_emails policies to service_role only (remove anon reachability).
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;

CREATE POLICY "Service role can read suppressed emails"
  ON public.suppressed_emails
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert suppressed emails"
  ON public.suppressed_emails
  FOR INSERT
  TO service_role
  WITH CHECK (true);

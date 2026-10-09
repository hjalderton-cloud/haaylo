-- 1) Purge orphaned anonymous accounts.
-- Verified before running: anonymous users own 0 content bank items, 0 marketing
-- history rows, 0 scheduled posts, and 2 empty business brains. The 3 anonymous
-- LinkedIn connections are superseded duplicates of an active non-anonymous one.
DELETE FROM public.social_connections sc
 USING auth.users u WHERE u.id = sc.user_id AND u.is_anonymous;

DELETE FROM public.business_brains b
 USING public.projects p, auth.users u
 WHERE p.id = b.project_id AND u.id = p.user_id AND u.is_anonymous;

DELETE FROM public.projects p
 USING auth.users u WHERE u.id = p.user_id AND u.is_anonymous;

DELETE FROM public.engine_usage e
 USING auth.users u WHERE u.id = e.user_id AND u.is_anonymous;

DELETE FROM public.profiles pr
 USING auth.users u WHERE u.id = pr.id AND u.is_anonymous;

DELETE FROM auth.users WHERE is_anonymous;

-- 2) Rescope the email tables from the public role to service_role.
DROP POLICY IF EXISTS "service role manages email send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can manage email send log" ON public.email_send_log;
DROP POLICY IF EXISTS "service_role_email_send_log" ON public.email_send_log;
CREATE POLICY "email_send_log_service_role"
  ON public.email_send_log FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service role manages email send state" ON public.email_send_state;
DROP POLICY IF EXISTS "Service role can manage email send state" ON public.email_send_state;
DROP POLICY IF EXISTS "service_role_email_send_state" ON public.email_send_state;
CREATE POLICY "email_send_state_service_role"
  ON public.email_send_state FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service role manages unsubscribe tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can manage unsubscribe tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "service_role_email_unsubscribe_tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "email_unsubscribe_tokens_service_role"
  ON public.email_unsubscribe_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
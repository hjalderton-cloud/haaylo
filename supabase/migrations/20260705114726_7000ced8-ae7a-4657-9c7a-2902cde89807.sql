-- Lock down SECURITY DEFINER function EXECUTE privileges
-- Trigger-only functions: revoke from everyone (only the trigger system needs them)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_subscriptions_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- RLS helpers + client RPCs: authenticated only, never anon/public
REVOKE ALL ON FUNCTION public.has_active_scheduler(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_scheduler(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.owns_project(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owns_project(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.has_director_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_director_access(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_engine_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_engine_plan(uuid) TO authenticated;

-- Exclude anonymous-signed-in users from engine_usage reads.
-- The authenticated role in Supabase includes anonymous sign-ins; the JWT flag
-- `is_anonymous` distinguishes them, so we explicitly reject those sessions.
DROP POLICY IF EXISTS "Users view their own usage" ON public.engine_usage;
CREATE POLICY "Users view their own usage"
  ON public.engine_usage
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );
CREATE OR REPLACE FUNCTION public.get_engine_plan(_user uuid)
 RETURNS TABLE(plan text, credits_limit integer, credits_used integer, credits_left integer, credits_period_start timestamp with time zone, brain_enabled boolean, active boolean, free_uses_remaining integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH member AS (
    SELECT public.has_membership(_user) AS is_member
  ), sub AS (
    SELECT s.membership_type, s.current_period_start
    FROM public.subscriptions s WHERE s.user_id = _user LIMIT 1
  ), access AS (
    SELECT ea.* FROM public.engine_access ea WHERE ea.user_id = _user LIMIT 1
  )
  -- Member: everything unlocked, unlimited generations.
  SELECT
    'membership'::text AS plan,
    999999 AS credits_limit,
    0 AS credits_used,
    999999 AS credits_left,
    COALESCE((SELECT current_period_start FROM sub), (SELECT credits_period_start FROM access)) AS credits_period_start,
    true AS brain_enabled,
    true AS active,
    0 AS free_uses_remaining
  WHERE (SELECT is_member FROM member)
  UNION ALL
  -- Non-member: free trial generations only.
  SELECT
    'none'::text,
    1,
    COALESCE((SELECT CASE WHEN free_generation_used THEN 1 ELSE 0 END FROM public.engine_usage WHERE user_id = _user), 0),
    GREATEST(1 - COALESCE((SELECT CASE WHEN free_generation_used THEN 1 ELSE 0 END FROM public.engine_usage WHERE user_id = _user), 0), 0),
    NULL,
    false,
    false,
    COALESCE((SELECT free_uses_remaining FROM public.engine_usage WHERE user_id = _user), 1)
  WHERE NOT (SELECT is_member FROM member)
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_tier(_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN public.has_membership(_user) THEN 'pro' ELSE 'none' END;
$function$;

REVOKE ALL ON FUNCTION public.get_engine_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_engine_plan(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_tier(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tier(uuid) TO service_role;
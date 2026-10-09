CREATE OR REPLACE FUNCTION public.get_engine_plan(_user uuid)
 RETURNS TABLE(plan text, credits_limit integer, credits_used integer, credits_left integer, credits_period_start timestamp with time zone, brain_enabled boolean, active boolean, free_uses_remaining integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH access AS (
    SELECT
      ea.*,
      CASE
        WHEN ea.comp_access = true AND ea.comp_tier IS NOT NULL THEN ea.comp_tier
        WHEN ea.founding_member = true AND (ea.founding_until IS NULL OR ea.founding_until > now()) THEN 'pro'
        WHEN ea.status IN ('active','trialing') AND ea.tier IS NOT NULL THEN ea.tier
        WHEN ea.status IN ('active','trialing') AND ea.plan IS NOT NULL THEN ea.plan
        ELSE 'none'
      END AS effective_plan
    FROM public.engine_access ea
    WHERE ea.user_id = _user
    LIMIT 1
  ), resolved AS (
    SELECT
      a.effective_plan,
      CASE
        WHEN a.comp_access = true THEN 999999
        WHEN a.effective_plan = 'starter' THEN 150
        WHEN a.effective_plan = 'pro' THEN 500
        WHEN a.effective_plan = 'expert' THEN 999999
        ELSE 0
      END AS effective_limit,
      CASE WHEN a.comp_access = true THEN 0 ELSE COALESCE(a.credits_used, 0) END AS effective_used,
      a.credits_period_start,
      (a.effective_plan IN ('pro','expert')) AS brain_enabled,
      (a.comp_access = true OR a.status IN ('active','trialing')) AS active
    FROM access a
  )
  SELECT
    r.effective_plan AS plan,
    r.effective_limit AS credits_limit,
    r.effective_used AS credits_used,
    CASE
      WHEN r.effective_plan = 'expert' THEN 999999
      ELSE GREATEST(r.effective_limit - r.effective_used, 0)
    END AS credits_left,
    r.credits_period_start,
    r.brain_enabled,
    r.active,
    COALESCE((SELECT free_uses_remaining FROM public.engine_usage WHERE user_id = _user), 0) AS free_uses_remaining
  FROM resolved r
  UNION ALL
  SELECT 'none', 1, COALESCE((SELECT CASE WHEN free_generation_used THEN 1 ELSE 0 END FROM public.engine_usage WHERE user_id = _user), 0),
    GREATEST(1 - COALESCE((SELECT CASE WHEN free_generation_used THEN 1 ELSE 0 END FROM public.engine_usage WHERE user_id = _user), 0), 0),
    NULL, false, false,
    COALESCE((SELECT free_uses_remaining FROM public.engine_usage WHERE user_id = _user), 1)
  WHERE NOT EXISTS (SELECT 1 FROM access)
  LIMIT 1;
$function$;
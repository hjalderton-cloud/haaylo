
ALTER TABLE public.engine_access
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'pro',
  ADD COLUMN IF NOT EXISTS credits_limit int NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS credits_used int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_period_start timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.engine_access
  DROP CONSTRAINT IF EXISTS engine_access_plan_check;
ALTER TABLE public.engine_access
  ADD CONSTRAINT engine_access_plan_check CHECK (plan IN ('starter','pro'));

CREATE OR REPLACE FUNCTION public.get_engine_plan(_user uuid)
RETURNS TABLE (
  plan text,
  credits_limit int,
  credits_used int,
  credits_left int,
  credits_period_start timestamptz,
  brain_enabled boolean,
  active boolean,
  free_uses_remaining int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ea.plan,
    ea.credits_limit,
    ea.credits_used,
    GREATEST(ea.credits_limit - ea.credits_used, 0) AS credits_left,
    ea.credits_period_start,
    (ea.plan = 'pro') AS brain_enabled,
    (ea.status IN ('active','trialing')) AS active,
    COALESCE((SELECT free_uses_remaining FROM public.engine_usage WHERE user_id = _user), 0) AS free_uses_remaining
  FROM public.engine_access ea
  WHERE ea.user_id = _user
  UNION ALL
  SELECT NULL, 0, 0, 0, NULL, false, false,
    COALESCE((SELECT free_uses_remaining FROM public.engine_usage WHERE user_id = _user), 0)
  WHERE NOT EXISTS (SELECT 1 FROM public.engine_access WHERE user_id = _user)
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_engine_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_engine_plan(uuid) TO authenticated, service_role;

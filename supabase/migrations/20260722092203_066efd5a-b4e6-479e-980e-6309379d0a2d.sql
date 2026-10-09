
-- Round 1: pricing tiers + free-trial slots
ALTER TABLE public.engine_access
  ADD COLUMN IF NOT EXISTS tier text CHECK (tier IN ('starter','pro','expert')),
  ADD COLUMN IF NOT EXISTS founding_member boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founding_until timestamptz;

-- Backfill existing pro plan rows
UPDATE public.engine_access SET tier = 'pro' WHERE tier IS NULL AND plan = 'pro';

ALTER TABLE public.engine_usage
  ADD COLUMN IF NOT EXISTS free_starter_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_voice_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_posts_used boolean NOT NULL DEFAULT false;

-- Helper: current tier for a user, accounting for founding-member window.
CREATE OR REPLACE FUNCTION public.get_user_tier(_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN ea.founding_member = true
         AND (ea.founding_until IS NULL OR ea.founding_until > now())
      THEN 'pro'
    WHEN ea.status IN ('active','trialing') AND ea.tier IS NOT NULL
      THEN ea.tier
    ELSE 'none'
  END
  FROM public.engine_access ea
  WHERE ea.user_id = _user
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_tier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_tier(uuid) TO authenticated, service_role;

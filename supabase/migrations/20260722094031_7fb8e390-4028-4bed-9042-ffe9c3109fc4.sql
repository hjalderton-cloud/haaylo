
-- 1) Roles infrastructure
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

-- 2) Comp access flags on engine_access
ALTER TABLE public.engine_access
  ADD COLUMN IF NOT EXISTS comp_access BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comp_tier TEXT;

-- 3) Redemption codes table
CREATE TABLE IF NOT EXISTS public.redemption_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL CHECK (tier IN ('starter','pro','expert')),
  expires_at TIMESTAMPTZ,
  single_use BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  redeemed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.redemption_codes TO authenticated;
GRANT ALL ON public.redemption_codes TO service_role;

ALTER TABLE public.redemption_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage codes" ON public.redemption_codes;
CREATE POLICY "admins manage codes" ON public.redemption_codes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_redemption_codes()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_redemption_codes ON public.redemption_codes;
CREATE TRIGGER trg_touch_redemption_codes
  BEFORE UPDATE ON public.redemption_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_redemption_codes();

-- 4) Redeem function — any authenticated user
CREATE OR REPLACE FUNCTION public.redeem_code(_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_row public.redemption_codes%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in to redeem a code.');
  END IF;

  SELECT * INTO v_row FROM public.redemption_codes
    WHERE upper(code) = upper(btrim(_code)) FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code not found.');
  END IF;

  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has expired.');
  END IF;

  IF v_row.single_use AND v_row.redeemed_by IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has already been used.');
  END IF;

  -- Grant comp access to this user
  INSERT INTO public.engine_access (
    user_id, tier, status, comp_access, comp_tier,
    credits_limit, credits_used, credits_period_start
  ) VALUES (
    v_user, v_row.tier, 'active', true, v_row.tier,
    999999, 0, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    comp_access = true,
    comp_tier = v_row.tier,
    tier = v_row.tier,
    status = 'active',
    credits_limit = 999999,
    credits_used = 0,
    credits_period_start = now();

  -- Mark code as redeemed (single-use only)
  IF v_row.single_use THEN
    UPDATE public.redemption_codes
      SET redeemed_by = v_user, redeemed_at = now()
      WHERE id = v_row.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'tier', v_row.tier);
END $$;

REVOKE ALL ON FUNCTION public.redeem_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_code(TEXT) TO authenticated;

-- 5) Admin bootstrap: claim admin while none exist
CREATE OR REPLACE FUNCTION public.claim_admin_bootstrap()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not signed in.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'An admin already exists.');
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user, 'admin')
    ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.claim_admin_bootstrap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_admin_bootstrap() TO authenticated;

-- 6) Update tier/plan helpers to respect comp_access
CREATE OR REPLACE FUNCTION public.get_user_tier(_user uuid)
 RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT CASE
    WHEN ea.comp_access = true AND ea.comp_tier IS NOT NULL
      THEN ea.comp_tier
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
$function$;

CREATE OR REPLACE FUNCTION public.get_engine_plan(_user uuid)
 RETURNS TABLE(plan text, credits_limit integer, credits_used integer, credits_left integer, credits_period_start timestamp with time zone, brain_enabled boolean, active boolean, free_uses_remaining integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $function$
  SELECT
    CASE WHEN ea.comp_access THEN COALESCE(ea.comp_tier, ea.plan) ELSE ea.plan END AS plan,
    CASE WHEN ea.comp_access THEN 999999 ELSE ea.credits_limit END AS credits_limit,
    CASE WHEN ea.comp_access THEN 0 ELSE ea.credits_used END AS credits_used,
    CASE WHEN ea.comp_access THEN 999999 ELSE GREATEST(ea.credits_limit - ea.credits_used, 0) END AS credits_left,
    ea.credits_period_start,
    (ea.comp_access AND COALESCE(ea.comp_tier, ea.plan) IN ('pro','expert')) OR (ea.plan = 'pro') AS brain_enabled,
    (ea.comp_access OR ea.status IN ('active','trialing')) AS active,
    COALESCE((SELECT free_uses_remaining FROM public.engine_usage WHERE user_id = _user), 0) AS free_uses_remaining
  FROM public.engine_access ea
  WHERE ea.user_id = _user
  UNION ALL
  SELECT NULL, 0, 0, 0, NULL, false, false,
    COALESCE((SELECT free_uses_remaining FROM public.engine_usage WHERE user_id = _user), 0)
  WHERE NOT EXISTS (SELECT 1 FROM public.engine_access WHERE user_id = _user)
  LIMIT 1;
$function$;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_schedule_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS membership_type text,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS founding_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS founding_renewal_reminder_sent_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_key ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_idx ON public.subscriptions (stripe_subscription_id);

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.stripe_webhook_events TO service_role;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages webhook events"
  ON public.stripe_webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.has_membership(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND (
        s.status IN ('active', 'trialing', 'past_due')
        OR (s.status = 'canceled' AND s.current_period_end > now())
      )
  ) OR EXISTS (
    SELECT 1 FROM public.engine_access ea
    WHERE ea.user_id = _user_id
      AND (
        ea.comp_access = true
        OR ea.status IN ('active', 'trialing')
        OR (ea.founding_member = true AND (ea.founding_until IS NULL OR ea.founding_until > now()))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_membership(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_membership(uuid) TO authenticated, service_role;